# Nyaya Drishti

Clean monorepo structure for publishing:

- `frontend/` - Vite + React app (deploy on Vercel)
- `backend/` - Flask API for STT/RAG/TTS (deploy on Render/Railway/Fly)

## 1) Local setup

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python app.py
```

## 2) Deployment

### Frontend (Vercel)

- Import this repository in Vercel.
- Set root directory to `frontend`.
- Add env var `VITE_BACKEND_URL` (your backend public URL ending with `/`).

### Backend

- Deploy `backend` folder as a Python web service.
- Start command:

```bash
gunicorn app:app
```

- Set required env vars from `backend/.env.example`.

## 3) Notes

- Keep PDFs (if needed by `/rag/pdf/...`) in `backend/data/pdfs/`.
- Do not commit `.env` files or credential JSON files.
