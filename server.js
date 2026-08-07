import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { Resend } from 'resend';
import axios from 'axios';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Allows large base64 image data payloads

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// 1. Connect to MongoDB Atlas
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => console.error('MongoDB connection error:', err));

// 2. Define Card Schema and Model
const cardSchema = new mongoose.Schema({
  prompt: { type: String, required: true },
  imageUrl: { type: String, required: true },
  category: { type: String, default: 'General' },
  createdAt: { type: Date, default: Date.now }
});

const Card = mongoose.model('Card', cardSchema);

// 3. API Route: Generate AI Greeting Card
app.post('/api/cards/generate', async (req, res) => {
  try {
    const { prompt, category } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    // Clean prompt for URL safety
    const formattedPrompt = encodeURIComponent(prompt);
    
    // Generate unique seed to prevent cached duplicates
    const seed = Math.floor(Math.random() * 1000000);
    
    // Use free Pollinations.ai text-to-image API
    const aiImageUrl = `https://pollinations.ai{formattedPrompt}?seed=${seed}&width=800&height=1200&nologo=true`;

    // Save metadata to MongoDB
    const newCard = new Card({
      prompt,
      imageUrl: aiImageUrl,
      category: category || 'General'
    });

    await newCard.save();

    res.status(201).json({
      message: 'Card generated and saved successfully',
      card: newCard
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate card', details: error.message });
  }
});

// 4. API Route: Fetch All History Cards
app.get('/api/cards', async (req, res) => {
  try {
    const cards = await Card.find().sort({ createdAt: -1 });
    res.status(200).json(cards);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch cards' });
  }
});

// 5. API Route: Download Helper (Handles CORS issues on the frontend)
app.get('/api/cards/download', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Image URL is required' });

    // Fetch image from Pollinations and pipe it directly to frontend to avoid canvas CORS blocks
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream'
    });

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', 'attachment; filename="greeting-card.jpg"');
    response.data.pipe(res);
  } catch (error) {
    res.status(500).json({ error: 'Download failed', details: error.message });
  }
});

// 6. API Route: Send Card via Email
app.post('/api/cards/send', async (req, res) => {
  try {
    const { recipientEmail, senderName, message, cardImageBase64 } = req.body;

    if (!recipientEmail || !cardImageBase64) {
      return res.status(400).json({ error: 'Recipient email and card image data are required' });
    }

    // Strip header metadata from base64 if present
    const base64Data = cardImageBase64.replace(/^data:image\/\w+;base64,/, '');

    // Send email via Resend API
    const data = await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to: recipientEmail,
      subject: `A beautiful greeting card from ${senderName || 'a Friend'}!`,
      html: `<p>Hello!</p><p>${senderName || 'Someone'} has sent you a greeting card with the message: </p><blockquote>"${message || ''}"</blockquote><p>See attached card below.</p>`,
      attachments: [
        {
          filename: 'greeting-card.jpg',
          content: base64Data,
        },
      ],
    });

    res.status(200).json({ message: 'Email sent successfully!', data });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send email', details: error.message });
  }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
