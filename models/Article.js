const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
    section: { type: String, required: true, lowercase: true },
    subCategory: { type: String, lowercase: true },
    title: { type: String, required: true },
    imageUrl: { type: String },
    description: { type: String },
    content: { type: String }, // पुराना वाला सपोर्ट बनाए रखने के लिए
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Article', articleSchema);