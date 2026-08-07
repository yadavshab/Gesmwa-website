const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || "";

if (MONGO_URI) {
    mongoose.connect(MONGO_URI)
        .then(() => console.log("MongoDB Connected Successfully"))
        .catch(err => console.log("MongoDB Connection Error:", err));
} else {
    console.log("Warning: MONGO_URI is missing in environment variables!");
}

// Schemas & Models
const adminSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    mobile: { type: String, required: true },
    email: { type: String, default: "yadavshab793@gmail.com" },
    role: { type: String, default: "admin" },
    status: { type: String, default: "active" },
    otp: { type: String },
    otpExpires: { type: Date }
});
const Admin = mongoose.model('Admin', adminSchema);

const visitSchema = new mongoose.Schema({
    count: { type: Number, default: 0 }
});
const Visit = mongoose.model('Visit', visitSchema);

// Dynamic Content Schema (Updated with linkUrl for Guide/External links)
const dynamicContentSchema = new mongoose.Schema({
    section: { type: String, required: true, lowercase: true, trim: true },
    subCategory: { type: String, lowercase: true, trim: true },
    title: { type: String, required: true },
    imageUrl: { type: String },
    linkUrl: { type: String }, // <--- बाहरी लिंक (जैसे Read Full Guide/Article के लिए)
    description: { type: String },
    date: { type: Date, default: Date.now }
});
const DynamicContent = mongoose.model('DynamicContent', dynamicContentSchema);

// Nodemailer Transporter Configuration for Login Alerts
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || "yadavshab793@gmail.com",
        pass: process.env.EMAIL_PASS 
    }
});

// Function to Send Login Notification Email (Background)
async function sendLoginAlert(username, role) {
    try {
        const mailOptions = {
            from: process.env.EMAIL_USER || "yadavshab793@gmail.com",
            to: "yadavshab793@gmail.com", 
            subject: `🚨 GEWA Security Alert: Admin Logged In (${username})`,
            text: `Hello Mayank,\n\nAdmin user "${username}" (${role}) successfully logged in to the GEWA Admin Control Center at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}.\n\n- GEWA Enterprise Security Gateway`
        };
        await transporter.sendMail(mailOptions);
        console.log(`Login alert email sent successfully for user: ${username}`);
    } catch (err) {
        console.error("Error sending login alert email:", err.message);
    }
}

// Helper to format mobile number
function formatMobile(num) {
    if (!num) return "";
    let cleaned = num.trim();
    if (!cleaned.startsWith('+')) {
        cleaned = cleaned.length === 10 ? '+91' + cleaned : '+' + cleaned;
    }
    return cleaned;
}

// Setup Admins Route
app.get('/api/admin/setup-my-admin', async (req, res) => {
    try {
        const masterPasswordHash = await bcrypt.hash('Mayank@Mainadmin', 10);
        const defaultPasswordHash = await bcrypt.hash('adminpassword123', 10);
        
        const adminsList = [
            { username: 'mayank', password: masterPasswordHash, mobile: '+918395972715' },
            { username: 'satish', password: defaultPasswordHash, mobile: '+917015374882' },
            { username: 'gures', password: defaultPasswordHash, mobile: '+918287744626' },
            { username: 'rajbir', password: defaultPasswordHash, mobile: '+918510865522' },
            { username: 'sunil', password: defaultPasswordHash, mobile: '+918222876304' }
        ];

        for (let adminData of adminsList) {
            let existing = await Admin.findOne({ username: adminData.username });
            if (!existing) {
                const newAdmin = new Admin({
                    username: adminData.username,
                    password: adminData.password,
                    mobile: adminData.mobile,
                    email: 'yadavshab793@gmail.com',
                    role: 'admin',
                    status: 'active'
                });
                await newAdmin.save();
            } else {
                existing.mobile = adminData.mobile;
                if(adminData.username === 'mayank') {
                    existing.password = adminData.password;
                }
                await existing.save();
            }
        }

        res.json({ success: true, message: "Admins configured successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Admin Login Route (Lightning Fast Response)
app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, message: "Username and password are required!" });
        }

        const user = await Admin.findOne({ username });
        if (!user) {
            return res.status(400).json({ success: false, message: "User not found!" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: "Invalid Password!" });
        }

        // Email alert is triggered instantly in background
        sendLoginAlert(user.username, user.role).catch(err => console.log("Background email error:", err.message));

        res.json({ success: true, role: user.role, username: user.username, message: "Login successful!" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Send OTP Route
app.post('/api/admin/send-otp', async (req, res) => {
    try {
        const { mobile } = req.body;
        const formattedMobile = formatMobile(mobile);
        const admin = await Admin.findOne({ mobile: formattedMobile });

        if (!admin) {
            return res.status(400).json({ success: false, message: `Unauthorized mobile number!` });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        admin.otp = otp;
        admin.otpExpires = Date.now() + 10 * 60 * 1000;
        await admin.save();

        const tenDigitNumber = formattedMobile.replace('+91', '');
        const apiKey = process.env.FAST2SMS_API_KEY;

        if (apiKey) {
            await fetch('https://www.fast2sms.com/dev/bulkV2', {
                method: 'POST',
                headers: {
                    'authorization': apiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    route: 'q',
                    message: `Your GEWA Admin OTP is ${otp}. Valid for 10 minutes.`,
                    language: 'english',
                    flash: 0,
                    numbers: tenDigitNumber
                })
            });
        }

        res.json({ success: true, message: "OTP sent successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Verify OTP Route (Lightning Fast Response)
app.post('/api/admin/verify-otp', async (req, res) => {
    try {
        const { mobile, otp } = req.body;
        const formattedMobile = formatMobile(mobile);
        const admin = await Admin.findOne({ mobile: formattedMobile });

        if (!admin || !admin.otp || admin.otp !== otp || admin.otpExpires < Date.now()) {
            return res.status(400).json({ success: false, message: "Invalid or expired OTP!" });
        }

        admin.otp = undefined;
        admin.otpExpires = undefined;
        await admin.save();

        // Email alert triggered in background
        sendLoginAlert(admin.username, admin.role).catch(err => console.log("Background email error:", err.message));

        res.json({ success: true, role: admin.role, username: admin.username, message: "OTP Login successful!" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 1. Upload Dynamic Content API (Supports linkUrl)
app.post('/api/admin/upload-dynamic', async (req, res) => {
    try {
        const { section, subCategory, title, imageUrl, description, linkUrl } = req.body;
        if (!section || !subCategory || !title) {
            return res.status(400).json({ success: false, message: "Section, Sub-category, and Title are required!" });
        }
        const newContent = new DynamicContent({ 
            section: section.toLowerCase().trim(), 
            subCategory: subCategory.toLowerCase().trim(), 
            title, 
            imageUrl, 
            linkUrl, 
            description 
        });
        await newContent.save();
        res.json({ success: true, message: "Content uploaded and live successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. Update Dynamic Content API (Supports linkUrl update)
app.put('/api/admin/update-dynamic/:id', async (req, res) => {
    try {
        const recordId = req.params.id;
        const { section, subCategory, title, imageUrl, description, linkUrl } = req.body;
        
        const updatedContent = await DynamicContent.findByIdAndUpdate(
            recordId,
            { 
                section: section ? section.toLowerCase().trim() : undefined, 
                subCategory: subCategory ? subCategory.toLowerCase().trim() : undefined, 
                title, 
                imageUrl, 
                linkUrl, 
                description 
            },
            { new: true }
        );

        if (!updatedContent) {
            return res.status(404).json({ success: false, message: "Record not found!" });
        }

        res.json({ success: true, message: "Updated successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. Delete Dynamic Content API
app.delete('/api/admin/delete-dynamic/:id', async (req, res) => {
    try {
        const recordId = req.params.id;
        const deletedContent = await DynamicContent.findByIdAndDelete(recordId);

        if (!deletedContent) {
            return res.status(404).json({ success: false, message: "Record not found!" });
        }

        res.json({ success: true, message: "Deleted successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4. Fetch All Content for a Section
app.get('/api/content/all/:section', async (req, res) => {
    try {
        const sectionName = req.params.section.toLowerCase().trim();
        const items = await DynamicContent.find({ section: sectionName }).sort({ date: -1 });
        res.json(items);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 5. Fetch All Content in Database
app.get('/api/content/all', async (req, res) => {
    try {
        const items = await DynamicContent.find({}).sort({ date: -1 });
        res.json(items);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 6. Fetch Dynamic Content API by Section & SubCategory
app.get('/api/content/:section/:subCategory', async (req, res) => {
    try {
        const { section, subCategory } = req.params;
        const items = await DynamicContent.find({ 
            section: section.toLowerCase().trim(), 
            subCategory: subCategory.toLowerCase().trim() 
        }).sort({ date: -1 });
        res.json(items);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Visit Count API Route
app.get('/api/visits', async (req, res) => {
    try {
        let visitData = await Visit.findOne();
        if (!visitData) {
            visitData = new Visit({ count: 1 });
            await visitData.save();
        } else {
            visitData.count += 1;
            await visitData.save();
        }
        res.json({ success: true, count: visitData.count });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});