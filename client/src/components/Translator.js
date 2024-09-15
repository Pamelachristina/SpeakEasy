import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Container, Form, Button, Alert, Row, Col, Card } from 'react-bootstrap';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const Translator = () => {
  const [conversation, setConversation] = useState([]);
  const [inputText, setInputText] = useState('');
  const [spanishInputText, setSpanishInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isListeningSpanish, setIsListeningSpanish] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [awaitingSpanishResponse, setAwaitingSpanishResponse] = useState(false);

  const recognitionRef = useRef(null);
  const spanishRecognitionRef = useRef(null);

  useEffect(() => {
    if ('webkitSpeechRecognition' in window) {
      recognitionRef.current = new window.webkitSpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      spanishRecognitionRef.current = new window.webkitSpeechRecognition();
      spanishRecognitionRef.current.continuous = false;
      spanishRecognitionRef.current.interimResults = false;
      spanishRecognitionRef.current.lang = 'es-ES';

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setInputText(transcript);
      };

      spanishRecognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setSpanishInputText(transcript);
      };

      recognitionRef.current.onerror = spanishRecognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        setError('Speech recognition failed. Please try again.');
        setIsListening(false);
        setIsListeningSpanish(false);
      };

      recognitionRef.current.onend = () => setIsListening(false);
      spanishRecognitionRef.current.onend = () => setIsListeningSpanish(false);
    } else {
      setError('Speech recognition is not supported in this browser.');
    }
  }, []);

  const addToConversation = (text, isEnglish) => {
    setConversation(prev => [...prev, { text, isEnglish }]);
  };

  const speakText = useCallback((text, language) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language;
    window.speechSynthesis.speak(utterance);
  }, []);

  const handleTranslate = useCallback(async (textToTranslate, fromEnglish = true) => {
    try {
      setIsLoading(true);
      const response = await axios.post(`${API_URL}/api/translate`, {
        text: textToTranslate,
        sourceLanguage: fromEnglish ? 'en-US' : 'es-ES',
        targetLanguage: fromEnglish ? 'es-ES' : 'en-US',
      });
      const translatedText = response.data.translation;
      
      if (fromEnglish) {
        addToConversation(textToTranslate, true);
        addToConversation(translatedText, false);
        speakText(translatedText, 'es-ES');
        setAwaitingSpanishResponse(true);
        setSuggestions([]); // Clear suggestions when waiting for Spanish response
      } else {
        addToConversation(textToTranslate, false);
        addToConversation(translatedText, true);
        await handleGetSuggestions(translatedText);
        setAwaitingSpanishResponse(false);
      }
      
      return translatedText;
    } catch (error) {
      setError('Translation failed. Please try again.');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [speakText]);

  const handleGetSuggestions = useCallback(async (text) => {
    try {
      const response = await axios.post(`${API_URL}/api/suggest`, { text });
      console.log('API Suggestions:', response.data.suggestions);
      
      // Format the suggestions
      const formattedSuggestions = response.data.suggestions.flatMap(suggestion => 
        suggestion.split('\n').map(s => s.trim()).filter(s => s)
      );
      
      // Split into three sets
      const suggestionSets = [
        formattedSuggestions.filter((_, index) => index % 3 === 0),
        formattedSuggestions.filter((_, index) => index % 3 === 1),
        formattedSuggestions.filter((_, index) => index % 3 === 2)
      ];
      
      setSuggestions(suggestionSets);
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
      setError('Failed to fetch suggestions. Please try again.');
      setSuggestions([]);
    }
  }, []);

  const handleSelectSuggestion = useCallback((suggestion) => {
    if (suggestion.trim()) {
      // Remove the number and quotes from the suggestion
      const cleanSuggestion = suggestion.replace(/^\d+\.\s*"|"$/g, '').trim();
      setInputText(cleanSuggestion);
      handleTranslate(cleanSuggestion, true);
    }
  }, [handleTranslate]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputText.trim()) {
      handleTranslate(inputText, true);
      setInputText('');
    }
  };

  const handleSpanishSubmit = (e) => {
    e.preventDefault();
    if (spanishInputText.trim()) {
      handleTranslate(spanishInputText, false);
      setSpanishInputText('');
    }
  };

  const toggleListening = (isSpanish = false) => {
    if (isSpanish) {
      if (isListeningSpanish) {
        spanishRecognitionRef.current.stop();
      } else {
        spanishRecognitionRef.current.start();
        setIsListeningSpanish(true);
      }
    } else {
      if (isListening) {
        recognitionRef.current.stop();
      } else {
        recognitionRef.current.start();
        setIsListening(true);
      }
    }
  };

  return (
    <Container className="mt-5">
      <h1>SpeakEasy</h1>
      
      <div className="conversation-container mb-4" style={{maxHeight: '300px', overflowY: 'auto'}}>
        {conversation.map((entry, index) => (
          <Alert key={index} variant={entry.isEnglish ? "primary" : "secondary"}>
            {entry.text}
          </Alert>
        ))}
      </div>

      <Form onSubmit={handleSubmit}>
        <Form.Group className="mb-3">
          <Form.Control
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type your message in English or click 'Listen' to speak"
          />
        </Form.Group>

        <Button type="submit" variant="primary" disabled={isLoading || !inputText.trim()}>
          Send
        </Button>

        <Button 
          variant={isListening ? "danger" : "secondary"} 
          onClick={() => toggleListening(false)} 
          className="ms-2"
        >
          {isListening ? 'Stop Listening' : 'Listen (English)'}
        </Button>
      </Form>

      {error && <Alert variant="danger" className="mt-3">{error}</Alert>}

      {awaitingSpanishResponse && (
        <Alert variant="info" className="mt-3">
          Waiting for Spanish response...
          <Form onSubmit={handleSpanishSubmit}>
            <Form.Control
              type="text"
              value={spanishInputText}
              onChange={(e) => setSpanishInputText(e.target.value)}
              placeholder="Enter Spanish response here or click 'Listen' to speak"
              className="mt-2"
            />
            <Button type="submit" variant="primary" className="mt-2">
              Submit Spanish Response
            </Button>
            <Button 
              variant={isListeningSpanish ? "danger" : "secondary"} 
              onClick={() => toggleListening(true)} 
              className="ms-2 mt-2"
            >
              {isListeningSpanish ? 'Stop Listening' : 'Listen (Spanish)'}
            </Button>
          </Form>
        </Alert>
      )}

      {suggestions.length > 0 && (
        <div className="mt-3">
          <h4>Suggested Responses</h4>
          <Row className="mt-4">
            {suggestions.map((suggestionSet, setIndex) => (
              <Col key={setIndex} xs={12} md={4} className="mb-3">
                <Card style={{ backgroundColor: '#f8f9fa' }} className="shadow-sm h-100">
                  <Card.Body>
                    <Card.Title>Suggestion Set {setIndex + 1}</Card.Title>
                    {suggestionSet.map((suggestion, index) => (
                      <Form.Check
                        key={index}
                        type="radio"
                        id={`suggestion-${setIndex}-${index}`}
                        label={suggestion}
                        name={`suggestionGroup${setIndex}`}
                        onChange={() => handleSelectSuggestion(suggestion)}
                      />
                    ))}
                  </Card.Body>
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      )}
    </Container>
  );
};

export default Translator;





