const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

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

// Welfare Bank Balance Schema
const welfareBalanceSchema = new mongoose.Schema({
    balance: { type: String, default: "7,89,703.38" }
});
const WelfareBalance = mongoose.model('WelfareBalance', welfareBalanceSchema);

// Activity Log Schema
const activityLogSchema = new mongoose.Schema({
    username: { type: String, required: true },
    action: { type: String, required: true },
    details: { type: String },
    date: { type: Date, default: Date.now }
});
const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

// Dynamic Content Schema
const dynamicContentSchema = new mongoose.Schema({
    section: { type: String, required: true, lowercase: true, trim: true },
    subCategory: { type: String, lowercase: true, trim: true },
    title: { type: String, required: true },
    imageUrl: { type: String },
    linkUrl: { type: String },
    description: { type: String },
    date: { type: Date, default: Date.now }
});
const DynamicContent = mongoose.model('DynamicContent', dynamicContentSchema);

// 👉 [NEW ADDITION] Volunteer Schema & Model
const volunteerSchema = new mongoose.Schema({
    serialNo: Number,
    name: { type: String, required: true },
    address: { type: String, required: true },
    occupation: { type: String, required: true },
    designation: { type: String, required: true }
});
const Volunteer = mongoose.model('Volunteer', volunteerSchema);

// ================= REAL-TIME SOCKET.IO INTEGRATION ================= //
let pageViewers = {};

io.on('connection', (socket) => {
    let currentPage = '';

    socket.on('join_page', (pageName) => {
        if (currentPage && pageViewers[currentPage]) {
            pageViewers[currentPage] = Math.max(0, pageViewers[currentPage] - 1);
        }

        currentPage = pageName;
        pageViewers[currentPage] = (pageViewers[currentPage] || 0) + 1;
        
        io.emit('update_counts', pageViewers);
    });

    socket.on('disconnect', () => {
        if (currentPage && pageViewers[currentPage]) {
            pageViewers[currentPage] = Math.max(0, pageViewers[currentPage] - 1);
            
            if (pageViewers[currentPage] === 0) {
                delete pageViewers[currentPage];
            }

            io.emit('update_counts', pageViewers);
        }
    });
});
// ================================================================= //

// Nodemailer Transporter Configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || "yadavshab793@gmail.com",
        pass: process.env.EMAIL_PASS 
    }
});

async function sendLoginAlert(username, role) {
    try {
        const mailOptions = {
            from: process.env.EMAIL_USER || "yadavshab793@gmail.com",
            to: "yadavshab793@gmail.com", 
            subject: `🚨 GEWA Security Alert: Admin Logged In (${username})`,
            text: `Hello Mayank,\n\nAdmin user "${username}" (${role}) successfully logged in to the GEWA Admin Control Center at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}.\n\n- GEWA Enterprise Security Gateway`
        };
        await transporter.sendMail(mailOptions);
    } catch (err) {
        console.error("Error sending login alert email:", err.message);
    }
}

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

// Admin Login Route
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

// Verify OTP Route
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

        sendLoginAlert(admin.username, admin.role).catch(err => console.log("Background email error:", err.message));

        res.json({ success: true, role: admin.role, username: admin.username, message: "OTP Login successful!" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ================= WELFARE BANK BALANCE ROUTES ================= //

app.get('/api/welfare/balance', async (req, res) => {
    try {
        let bData = await WelfareBalance.findOne();
        if (!bData) {
            bData = new WelfareBalance({ balance: "7,89,703.38" });
            await bData.save();
        }
        res.json({ success: true, balance: bData.balance });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/admin/update-balance', async (req, res) => {
    try {
        const { balance, username } = req.body;
        
        if (!username || username.toLowerCase() !== 'mayank') {
            return res.status(403).json({ success: false, message: "Access Denied: Only Main Admin (Mayank) can update the balance!" });
        }

        if (!balance) {
            return res.status(400).json({ success: false, message: "Balance is required!" });
        }

        let bData = await WelfareBalance.findOne();
        if (!bData) {
            bData = new WelfareBalance({ balance });
        } else {
            bData.balance = balance;
        }
        await bData.save();

        io.emit('balance_updated', balance);

        await ActivityLog.create({ username: 'mayank', action: 'Updated Bank Balance', details: `New Balance: ₹${balance}` });

        res.json({ success: true, message: "Welfare bank balance updated successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ================= ADMIN ACTIVITY LOG ROUTES ================= //
app.get('/api/admin/logs', async (req, res) => {
    try {
        const logs = await ActivityLog.find({}).sort({ date: -1 }).limit(25);
        res.json({ success: true, logs });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/admin/log-action', async (req, res) => {
    try {
        const { username, action, details } = req.body;
        if (!username || !action) {
            return res.status(400).json({ success: false, message: "Username and action are required!" });
        }
        await ActivityLog.create({ username, action, details });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ================= DYNAMIC CONTENT ROUTES ================= //

app.post('/api/admin/upload-dynamic', async (req, res) => {
    try {
        const { section, subCategory, title, imageUrl, description, linkUrl, username } = req.body;
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

        if (username) {
            await ActivityLog.create({ username, action: 'Published New Content', details: `Section: ${section} | Title: ${title}` });
        }

        res.json({ success: true, message: "Content uploaded and live successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/admin/update-dynamic/:id', async (req, res) => {
    try {
        const recordId = req.params.id;
        const { section, subCategory, title, imageUrl, description, linkUrl, username } = req.body;
        
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

        if (username) {
            await ActivityLog.create({ username, action: 'Updated Content', details: `Title: ${title || 'Record'}` });
        }

        res.json({ success: true, message: "Updated successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/admin/delete-dynamic/:id', async (req, res) => {
    try {
        const recordId = req.params.id;
        const deletedContent = await DynamicContent.findByIdAndDelete(recordId);

        if (!deletedContent) {
            return res.status(404).json({ success: false, message: "Record not found!" });
        }

        res.json({ success: true, message: "Deleted a content record" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/content/all/:section', async (req, res) => {
    try {
        const sectionName = req.params.section.toLowerCase().trim();
        const items = await DynamicContent.find({ section: sectionName }).sort({ date: -1 });
        res.json(items);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/content/all', async (req, res) => {
    try {
        const items = await DynamicContent.find({}).sort({ date: -1 });
        res.json(items);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

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

// ================= [NEW ADDITION] VOLUNTEERS API ROUTES (STRICTLY FOR MAYANK) ================= //

// 1. Get All Volunteers (डेटाबेस खाली होने पर 12 डिफ़ॉल्ट अधिकारी ऑटो-लोड हो जाएंगे)
app.get('/api/volunteers', async (req, res) => {
    try {
        let list = await Volunteer.find({}).sort({ serialNo: 1 });
        if (list.length === 0) {
            const defaultOfficials = [
                { serialNo: 1, name: 'Lt.Col. (Retd) Phool Kumar Mor', address: 'Tau Devi Lal Colony, Hissar Cantt, Haryana', occupation: 'Pensioner', designation: 'President' },
                { serialNo: 2, name: 'Hony.Sub Maj (Retd.) Ramniwas', address: 'Village Malikpur, Jhajjar, Haryana', occupation: 'Pensioner', designation: 'Vice President' },
                { serialNo: 3, name: 'H/Sub Maj (Retd.) Jagvir Singh', address: 'VPO Kakrola, Delhi', occupation: 'Pensioner', designation: 'Gen-Secretary' },
                { serialNo: 4, name: 'Sub Ramesh Singh', address: 'Village Kalwa, Jind, Haryana', occupation: 'Pensioner', designation: 'Joint Secretary' },
                { serialNo: 5, name: 'Smt. Pushpa W/O (Retd.) Satish Kumar', address: 'VPO Chhuchhkwas, Jhajjar, Haryana', occupation: 'Housewife', designation: 'Treasurer' },
                { serialNo: 6, name: 'Hav. (Retd.) Sunil Kumar Ahlawat', address: 'VPO Dighal, Jhajjar, Haryana', occupation: 'Pensioner', designation: 'Joint-Treasurer' },
                { serialNo: 7, name: 'Smt. Ritu W/O (Retd.) Rajbir Malik', address: 'Gram Sabha, Pooth Kalan, Delhi', occupation: 'Housewife', designation: 'Founder / Advisor' },
                { serialNo: 8, name: 'Hony.Capt (Retd.) Parma Ram', address: 'Nagri, Nagour, Rajasthan', occupation: 'Pensioner', designation: 'Advisor' },
                { serialNo: 9, name: 'Hav (Retd.) Parmod Kumar', address: 'Village Bupania, Bahadurgarh, Haryana', occupation: 'Pensioner', designation: 'Exe-Member' },
                { serialNo: 10, name: 'Hav (Retd.) Balwan', address: 'Tajnagar, Gurgaon, Haryana', occupation: 'Pensioner', designation: 'Exe-Member' },
                { serialNo: 11, name: 'Hav. (Retd.) Parveen Kumar', address: 'Amadalshahpur, Jhajjar, Haryana', occupation: 'Pensioner', designation: 'Exe-Member' },
                { serialNo: 12, name: 'Hav (Retd.) Deep Chand', address: 'Naveen Vihar, Begampur, Delhi', occupation: 'Pensioner', designation: 'Exe-Member' }
            ];
            await Volunteer.insertMany(defaultOfficials);
            list = await Volunteer.find({}).sort({ serialNo: 1 });
        }
        res.json({ success: true, volunteers: list });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. Add Volunteer (केवल मयंक के लिए)
app.post('/api/admin/volunteer', async (req, res) => {
    try {
        const { username, serialNo, name, address, occupation, designation } = req.body;
        if (!username || username.toLowerCase() !== 'mayank') {
            return res.status(403).json({ success: false, message: "Access Denied: Only Mayank can add volunteers!" });
        }
        const newVol = new Volunteer({ serialNo, name, address, occupation, designation });
        await newVol.save();
        await ActivityLog.create({ username: 'mayank', action: 'Added Volunteer', details: `Name: ${name}` });
        res.json({ success: true, message: "Volunteer added successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. Update Volunteer (केवल मयंक के लिए)
app.put('/api/admin/volunteer/:id', async (req, res) => {
    try {
        const { username, serialNo, name, address, occupation, designation } = req.body;
        if (!username || username.toLowerCase() !== 'mayank') {
            return res.status(403).json({ success: false, message: "Access Denied: Only Mayank can update volunteers!" });
        }
        await Volunteer.findByIdAndUpdate(req.params.id, { serialNo, name, address, occupation, designation });
        await ActivityLog.create({ username: 'mayank', action: 'Updated Volunteer', details: `Name: ${name}` });
        res.json({ success: true, message: "Volunteer updated successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4. Delete Volunteer (केवल मयंक के लिए)
app.delete('/api/admin/volunteer/:id', async (req, res) => {
    try {
        const username = req.headers['x-username'] || '';
        if (!username || username.toLowerCase() !== 'mayank') {
            return res.status(403).json({ success: false, message: "Access Denied: Only Mayank can delete volunteers!" });
        }
        await Volunteer.findByIdAndDelete(req.params.id);
        await ActivityLog.create({ username: 'mayank', action: 'Deleted Volunteer', details: `ID: ${req.params.id}` });
        res.json({ success: true, message: "Volunteer deleted successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// =========================================================================================

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
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});