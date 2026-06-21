from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    GROQ_API_KEY: str = ""
    OPENROUTER_API_KEY: str = ""
    MODEL: str = "openai/gpt-5.4-nano"
    ADMIN_PASSWORD: str = "admin"
    SESSION_SECRET: str = ""
    COOKIE_SECURE: bool = False

    def model_post_init(self, __context) -> None:
        if not self.SESSION_SECRET:
            object.__setattr__(self, "SESSION_SECRET", f"cgis::{self.ADMIN_PASSWORD}")


@lru_cache
def get_settings() -> Settings:
    return Settings()
