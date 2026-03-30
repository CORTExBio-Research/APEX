import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_DB = f"sqlite+aiosqlite:///{os.path.join(_BASE_DIR, '..', 'apex.db')}"
DATABASE_URL = os.getenv("APEX_DATABASE_URL", _DEFAULT_DB)
# Convert sync sqlite URL to async if needed
if DATABASE_URL.startswith("sqlite:///") and "aiosqlite" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("sqlite:///", "sqlite+aiosqlite:///")

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
