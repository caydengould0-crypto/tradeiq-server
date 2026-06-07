const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const alertHistory = [];
app.get('/', (req, res) => {
  res.json({ status: 'TradeIQ Server Running', time: new Date().toISOString() });
});
app.get('/history', (req, res) => {
  res.json(alertHistory.slice(-20));
});
app.post('/alert', async (req, res) => {
  const body = req.body;
  const { ticker='Unknown', action='Unknown', close=null, open=null, high=null, low=null, volume=null, interval=null, time=new Date().toISOString(), rsi=null, ema_fast=null, ema_slow=null, atr=null, vwap=null, custom_message='' } = body;
  const marketContext = `Ticker: ${ticker}
Action/Signal: ${action}
Timeframe: ${interval || 'Unknown'}
Time: ${time}
Close: ${close ?? 'N/A'} | Open: ${open ?? 'N/A'} | High: ${high ?? 'N/A'} | Low: ${low ?? 'N/A'} | Volume: ${volume ?? 'N/A'}
RSI: ${rsi ?? 'N/A'} | EMA Fast: ${ema_fast ?? 'N/A'} | EMA Slow: ${ema_slow ?? 'N/A'} | ATR: ${atr ?? 'N/A'} | VWAP: ${vwap ?? 'N/A'}
Notes: ${custom_message || 'None'}`;
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1000,
      system: `You are TradeIQ, an expert futures trading analyst for a TopstepX prop trader on a $50,000 funded account.
Rules: No trades before 10 AM ET. No trades after 3 PM ET. $1,000 daily loss limit. Avoid 12-1 PM dead zone.
Always respond with:
1. DECISION: GO or NO-GO
2. CONFIDENCE: percentage
3. REASON: 2-3 sentences
4. KEY RISK: one sentence
5. SUGGESTION: one specific action
Be direct and fast. No fluff.`,
      messages: [{ role: 'user', content: `Analyze this alert:\n\n${marketContext}` }]
    });
    const result = { id: Date.now(), timestamp: new Date().toISOString(), ticker, action, close, interval, analysis: response.content[0].text, raw: body };
    alertHistory.unshift(result);
    if (alertHistory.length > 20) alertHistory.pop();
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.post('/analyze', async (req, res) => {
  const { message, context } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1000,
      system: `You are TradeIQ, an expert futures trading analyst for a TopstepX prop trader. No trades before 10 AM ET, after 3 PM ET, or during 12-1 PM. $1,000 daily loss limit. Be direct and concise.`,
      messages: [...(context || []), { role: 'user', content: message }]
    });
    res.json({ success: true, reply: response.content[0].text });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
app.post('/apex-live', async (req, res) => {
  try {
    const { image, context, media_type } = req.body;
    if (!image) return res.status(400).json({ error: 'No image' });
    const parts = [];
    if (context?.bias) parts.push(`Daily bias: ${context.bias}`);
    if (context?.session) parts.push(`Session: ${context.session}`);
    if (context?.instrument) parts.push(`Instrument: ${context.instrument}`);
    if (context?.timeframe) parts.push(`Timeframe: ${context.timeframe}`);
    if (context?.notes) parts.push(`Notes: ${context.notes}`);
    const ctx = parts.length ? '\n\nCONTEXT:\n' + parts.join('\n') : '';
    const imgMediaType = media_type || 'image/jpeg';
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: imgMediaType, data: image }},
          { type: 'text', text: 'Read this live trading screen. What do you see and what should I do?' + ctx }
        ]
      }]
    });
    const analysis = response.content?.[0]?.text || 'Analysis unavailable';
    res.json({ analysis, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('Apex live error:', err);
    res.status(500).json({ error: err.message, analysis: '❌ Error: ' + err.message });
  }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TradeIQ Server running on port ${PORT}`));


