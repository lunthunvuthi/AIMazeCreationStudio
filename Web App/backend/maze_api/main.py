from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import router

app = FastAPI(title="Maze Studio API")

# Phase 1 frontend is a separate-origin Vite dev server; the API is stateless
# with no auth, so wide-open CORS is fine until deployment is decided (§1).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
