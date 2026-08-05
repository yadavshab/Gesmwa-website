const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
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

// Nodemailer Setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'yadavshab793@gmail.com',
        pass: process.env.EMAIL_PASS || ''
    }
});

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

// Send OTP Route (Restricted to any of the 5 Authorized Admin Mobiles)
app.post('/api/admin/send-otp', async (req, res) => {
    try {
        const { mobile } = req.body;
        const admin = await Admin.findOne({ mobile });

        if (!admin) {
            return res.status(400).json({ success: false, message: "Unauthorized mobile number! Only authorized admins can request OTP." });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        admin.otp = otp;
        admin.otpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes expiry
        await admin.save();

        // Send OTP to registered admin email
        await transporter.sendMail({
            from: process.env.EMAIL_USER || 'yadavshab793@gmail.com',
            to: admin.email,
            subject: 'GEWA Secure Admin Login OTP',
            text: `Your verification OTP for admin (${admin.username}) is: ${otp}. Valid for 10 minutes.`
        });

        res.json({ success: true, message: "OTP sent successfully to authorized admin contact!" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Verify OTP Login Route
app.post('/api/admin/verify-otp', async (req, res) => {
    try {
        const { mobile, otp } = req.body;
        const admin = await Admin.findOne({ mobile });

        if (!admin) {
            return res.status(400).json({ success: false, message: "Unauthorized mobile number!" });
        }

        if (!admin.otp || admin.otp !== otp || admin.otpExpires < Date.now()) {
            return res.status(400).json({ success: false, message: "Invalid or expired OTP!" });
        }

        // Clear OTP after successful use
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