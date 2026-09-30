"""
iClinicalAi Backend — FastAPI Application
AI-assisted clinical research automation platform.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.documents import router as documents_router
from routes.analysis import router as analysis_router
from routes.trials import router as trials_router
from routes.manage import router as manage_router
from routes.auth import router as auth_router
from routes.biostats import router as biostats_router
from routes.safety import router as safety_router
from routes.admin import router as admin_router
from routes.contact import router as contact_router

from database import init_db
init_db()

app = FastAPI(
    title="iClinicalAi API",
    description="AI-assisted clinical research automation platform — DESIGN Module",
    version="1.0.0-mvp",
)

# CORS — allow React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", 
        "http://127.0.0.1:5173", 
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://iclinical.ai",
        "https://app.iclinical.ai",
        "https://www.iclinical.ai",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "https://ops.iclinical.ai"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth_router)
app.include_router(documents_router)
app.include_router(analysis_router)
app.include_router(trials_router)
app.include_router(manage_router)
app.include_router(biostats_router)
app.include_router(safety_router)
app.include_router(admin_router)
app.include_router(contact_router)



@app.get("/")
async def root():
    return {
        "name": "iClinicalAi API",
        "version": "1.0.0-mvp",
        "module": "DESIGN",
        "status": "running",
    }


@app.get("/health")
async def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
