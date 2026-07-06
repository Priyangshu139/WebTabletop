import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'lobby-server' });
});

app.listen(port, () => {
  console.log(`Backend server running on port ${port}`);
});
