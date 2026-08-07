import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { Resend } from 'resend';

dotenv.config();

const app = express();

// FORCE CORS TO ALLOW ACCESS FROM ANY SITE
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

const resend = new Resend(process.env.RESEND_API_KEY || 're_fake');

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => console.error('MongoDB connection error:', err));

const cardSchema = new mongoose.Schema({
  prompt: { type: String, required: true },
  imageUrl: { type: String, required: true },
  category: { type: String, default: 'General' },
  createdAt: { type: Date, default: Date.now }
});
const Card = mongoose.model('Card', cardSchema);

// REST API Route
app.post('/api/cards/generate', async (req, res) => {
  try {
    const { prompt, category } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });
    
    const formattedPrompt = encodeURIComponent(prompt);
    const seed = Math.floor(Math.random() * 1000000);
    
    // Stable public Pollinations fallback endpoint format
    const aiImageUrl = `https://pollinations.ai{formattedPrompt}?seed=${seed}&width=800&height=1200&nologo=true`;

    const newCard = new Card({ prompt, imageUrl: aiImageUrl, category: category || 'General' });
    await newCard.save();
    
    res.status(201).json({ message: 'Card generated successfully', card: newCard });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate card', details: error.message });
  }
});

app.post('/api/cards/send', async (req, res) => {
  try {
    const { recipientEmail, senderName, message, cardImageBase64 } = req.body;
    if (!recipientEmail || !cardImageBase64) return res.status(400).json({ error: 'Required fields missing' });
    const base64Data = cardImageBase64.replace(/^data:image\/\w+;base64,/, '');

    const data = await resend.emails.send({
      from: process.env.FROM_EMAIL || 'onboarding@resend.dev',
      to: recipientEmail,
      subject: `A beautiful greeting card from ${senderName || 'a Friend'}!`,
      html: `<p>${senderName || 'Someone'} sent you a card: </p><blockquote>"${message || ''}"</blockquote>`,
      attachments: [{ filename: 'greeting-card.jpg', content: base64Data }],
    });
    res.status(200).json({ message: 'Email sent successfully!', data });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send email', details: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
