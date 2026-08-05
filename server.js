const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

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

const articleSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    image: { type: String, default: "" }
});
const Article = mongoose.model('Article', articleSchema);

const visitSchema = new mongoose.Schema({
    count: { type: Number, default: 0 }
});
const Visit = mongoose.model('Visit', visitSchema);

// Helper to format mobile number (+91 auto-prepend)
function formatMobile(num) {
    if (!num) return "";
    let cleaned = num.trim();
    if (!cleaned.startsWith('+')) {
        cleaned = cleaned.length === 10 ? '+91' + cleaned : '+' + cleaned;
    }
    return cleaned;
}

// Routes
app.get('/api/articles', async (req, res) => {
    try {
        const articles = await Article.find();
        res.json(articles);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Setup All 5 Admins with +91 Mobile Numbers
app.get('/api/admin/setup-my-admin', async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash('adminpassword123', 10);
        
        const adminsList = [
            { username: 'mayank', mobile: '+918395972715' },
            { username: 'satish', mobile: '+917017374882' },
            { username: 'gures', mobile: '+918287744626' },
            { username: 'rajbir', mobile: '+918510865522' },
            { username: 'sunil', mobile: '+918222876304' }
        ];

        for (let adminData of adminsList) {
            let existing = await Admin.findOne({ username: adminData.username });
            if (!existing) {
                const newAdmin = new Admin({
                    username: adminData.username,
                    password: hashedPassword,
                    mobile: adminData.mobile,
                    email: 'yadavshab793@gmail.com',
                    role: 'admin',
                    status: 'active'
                });
                await newAdmin.save();
            } else {
                existing.mobile = adminData.mobile;
                await existing.save();
            }
        }

        res.json({ success: true, message: "All 5 Admins Configured Successfully with +91 Mobile Numbers!" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Password Login
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

        res.json({ success: true, role: user.role, username: user.username, message: "Login successful!" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Send OTP Route via Fast2SMS
app.post('/api/admin/send-otp', async (req, res) => {
    try {
        const { mobile } = req.body;
        const formattedMobile = formatMobile(mobile);

        const admin = await Admin.findOne({ mobile: formattedMobile });

        if (!admin) {
            return res.status(400).json({ success: false, message: `Unauthorized mobile number (${formattedMobile})!` });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        admin.otp = otp;
        admin.otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes expiry
        await admin.save();

        const tenDigitNumber = formattedMobile.replace('+91', '');
        const apiKey = process.env.FAST2SMS_API_KEY;

        if (apiKey) {
            const smsResponse = await fetch('https://www.fast2sms.com/dev/bulkV2', {
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
            const smsResult = await smsResponse.json();
            console.log("Fast2SMS Response:", smsResult);
        } else {
            console.log(`[WARNING] FAST2SMS_API_KEY missing! OTP for ${admin.username}: ${otp}`);
        }

        res.json({ success: true, message: "OTP sent successfully to your mobile phone via SMS!" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Verify OTP Login Route
app.post('/api/admin/verify-otp', async (req, res) => {
    try {
        const { mobile, otp } = req.body;
        const formattedMobile = formatMobile(mobile);

        const admin = await Admin.findOne({ mobile: formattedMobile });

        if (!admin) {
            return res.status(400).json({ success: false, message: "Unauthorized mobile number!" });
        }

        if (!admin.otp || admin.otp !== otp || admin.otpExpires < Date.now()) {
            return res.status(400).json({ success: false, message: "Invalid or expired OTP!" });
        }

        admin.otp = undefined;
        admin.otpExpires = undefined;
        await admin.save();

        res.json({ success: true, role: admin.role, username: admin.username, message: "OTP Login successful!" });
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

// Server Listener
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});