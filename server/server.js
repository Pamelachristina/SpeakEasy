require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Translate } = require('@google-cloud/translate').v2;
const speech = require('@google-cloud/speech');
const OpenAI = require('openai'); // Correct OpenAI import

// Set the Google Cloud credentials path
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(__dirname, '..', 'credentials', 'google-cloud-key.json');

const app = express();

app.use(cors({
  origin: 'http://localhost:3000'
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../client/build')));

// Initialize Google Cloud services
const translate = new Translate();
const speechClient = new speech.SpeechClient();

// Initialize OpenAI API
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Ensure the API key is set in your .env file
});

// Speech-to-text route
app.post('/api/speech-to-text', async (req, res) => {
  console.log('Received speech-to-text request');
  try {
    const { audio, encoding, sampleRateHertz, languageCode } = req.body;
    console.log('Audio data length:', audio.length);
    console.log('Encoding:', encoding);
    console.log('Sample rate:', sampleRateHertz);
    console.log('Language code:', languageCode);

    const request = {
      audio: { content: audio },
      config: {
        encoding: encoding,
        sampleRateHertz: sampleRateHertz,
        languageCode: languageCode,
      },
    };

    console.log('Sending request to Google Speech-to-Text API...');
    const [response] = await speechClient.recognize(request);
    console.log('Raw response from Google Speech-to-Text API:', JSON.stringify(response, null, 2));

    if (response.results && response.results.length > 0) {
      const transcription = response.results
        .map(result => result.alternatives[0].transcript)
        .join('\n');

      console.log('Transcription:', transcription);
      res.json({ transcription });
    } else {
      console.log('No transcription results');
      res.json({ transcription: '' });
    }
  } catch (error) {
    console.error('Speech-to-text error details:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Speech-to-text failed', 
      details: error.message,
      stack: error.stack
    });
  }
});

// Translation route
app.post('/api/translate', async (req, res) => {
  try {
    const { text, sourceLanguage, targetLanguage } = req.body;
    console.log('Translation request:', { text, sourceLanguage, targetLanguage });

    const [translation] = await translate.translate(text, {
      from: sourceLanguage,
      to: targetLanguage
    });

    console.log('Translation result:', translation);
    res.json({ translation });
  } catch (error) {
    console.error('Translation error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Translation failed', 
      details: error.message,
      stack: error.stack
    });
  }
});

// Suggestions route using OpenAI
app.post('/api/suggest', async (req, res) => {
  try {
    const { text } = req.body;
    console.log('Suggestion request received:', { text });

    // Use the correct method for the OpenAI API (chat.completions.create for gpt-3.5-turbo)
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",  // Updated model
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: `Given this translated text: "${text}", suggest three natural ways to continue the conversation.` }
      ],
      max_tokens: 150,
      n: 3,
      temperature: 0.7,
    });

    const suggestions = completion.choices.map(choice => choice.message.content.trim());
    console.log('Generated suggestions:', suggestions);
    res.json({ suggestions });
  } catch (error) {
    console.error('Failed to generate suggestions:', error);
    res.status(500).json({
      error: 'Failed to generate suggestions',
      details: error.message,
      stack: error.stack
    });
  }
});


// Find available port and start the server
function findAvailablePort(startPort) {
  return new Promise((resolve, reject) => {
    const server = express()
      .listen(startPort, () => {
        server.close(() => {
          resolve(startPort);
        });
      })
      .on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          resolve(findAvailablePort(startPort + 1));
        } else {
          reject(err);
        }
      });
  });
}

const startPort = process.env.PORT || 5000;

findAvailablePort(startPort).then((port) => {
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}).catch((err) => {
  console.error('Failed to find an available port:', err);
});


