require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// हमने जो Article का मॉडल बनाया था, उसे यहाँ जोड़ रहे हैं
const Article = require('./models/Article');

const app = express();

app.use(cors());
app.use(express.json());

// MongoDB डेटाबेस से कनेक्शन (यहाँ अपना .env वाला लिंक ही रहने दें या सीधा लिंक डाल दें)
mongoose.connect("mongodb+srv://yadavshab954_db_user:TVl0FNQdcEfM0FoK@cluster0.exmhi0c.mongodb.net/?appName=Cluster0")
    .then(() => console.log('✅ MongoDB से सफलतापूर्वक जुड़ गए!'))
    .catch((err) => console.log('❌ MongoDB कनेक्शन एरर:', err));

// ==========================================
// हमारी API (Routes)
// ==========================================

// 1. सारे आर्टिकल्स देखने का रास्ता (GET API)
app.get('/api/articles', async (req, res) => {
    try {
        const articles = await Article.find().sort({ createdAt: -1 }); // नए आर्टिकल्स सबसे ऊपर दिखेंगे
        res.json(articles);
    } catch (error) {
        res.status(500).json({ error: "आर्टिकल्स लाने में समस्या आई" });
    }
});

// 2. नया आर्टिकल सेव करने का रास्ता (POST API)
app.post('/api/articles', async (req, res) => {
    try {
        const newArticle = new Article({
            title: req.body.title,
            content: req.body.content,
            image: req.body.image
        });
        await newArticle.save(); // डेटाबेस में सेव करना
        res.status(201).json({ message: "🎉 आर्टिकल सफलतापूर्वक सेव हो गया!", article: newArticle });
    } catch (error) {
        res.status(500).json({ error: "आर्टिकल सेव करने में समस्या आई" });
    }
});

// ==========================================

// सर्वर चालू करना
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 सर्वर http://localhost:${PORT} पर चालू हो गया है`);
});