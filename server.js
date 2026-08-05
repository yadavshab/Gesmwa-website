const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();

// 🟢 Explicit CORS Setup (इसे ठीक से सेट करें ताकि कोई ब्लॉक न हो)
app.use(cors({
    origin: '*', // आप चाहें तो यहाँ 'https://gesmwa.in' भी लिख सकते हैं
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Handle preflight requests explicitly
app.options('*', cors());

app.use(express.json());

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://cluster0... (your mongodb uri)";

mongoose.connect(MONGO_URI)
    .then(() => console.log("MongoDB Connected Successfully"))
    .catch(err => console.log("MongoDB Connection Error:", err));

// Nodemailer Transporter Setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'yadavshab793@gmail.com',
        pass: process.env.EMAIL_PASS
    }
});

// Admin Schema
const adminSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    email: { type: String, default: "yadavshab793@gmail.com" },
    role: { type: String, default: "admin" },
    status: { type: String, default: "active" }
});
const Admin = mongoose.model('Admin', adminSchema);

// Article Schema
const articleSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    image: { type: String, default: "" }
});
const Article = mongoose.model('Article', articleSchema);

// 1. Get All Articles Route
app.get('/api/articles', async (req, res) => {
    try {
        const articles = await Article.find();
        res.json(articles);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. Setup Main Admin Route
app.get('/api/admin/setup-my-admin', async (req, res) => {
    try {
        const existingAdmin = await Admin.findOne({ username: 'mayank' });
        if (existingAdmin) {
            return res.json({ success: true, message: "Admin account already exists! Username: mayank, Password: adminpassword123" });
        }

        const hashedPassword = await bcrypt.hash('adminpassword123', 10);
        const newAdmin = new Admin({
            username: 'mayank',
            password: hashedPassword,
            email: 'yadavshab793@gmail.com',
            role: 'admin',
            status: 'active'
        });

        await newAdmin.save();
        res.json({ success: true, message: "Main Admin Account Created Successfully! Username: mayank, Password: adminpassword123" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. Login Route
app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await Admin.findOne({ username });

        if (!user) return res.status(400).json({ success: false, message: "User not found!" });
        if (user.status === 'pending') return res.status(403).json({ success: false, message: "Your access is pending approval by Main Admin." });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ success: false, message: "Invalid Password!" });

        if (user.role === 'admin' && process.env.EMAIL_PASS) {
            const mailOptions = {
                from: process.env.EMAIL_USER || 'yadavshab793@gmail.com',
                to: user.email,
                subject: 'Security Alert: Admin Login Detected',
                text: `Alert! Admin '${username}' has successfully logged into the GEWA Admin Dashboard at ${new Date().toLocaleString()}.`
            };
            transporter.sendMail(mailOptions, (err) => {
                if (err) console.log('Email notification error:', err);
            });
        }

        res.json({ success: type = true, role: user.role, username: user.username, message: "Login successful!" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Server Listener
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});