import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
WHATSAPP_TOKEN = os.getenv("WHATSAPP_TOKEN", "")
WHATSAPP_PHONE_ID = os.getenv("WHATSAPP_PHONE_ID", "")
WHATSAPP_VERIFY_TOKEN = os.getenv("WHATSAPP_VERIFY_TOKEN", "meta-koda-verify")
GOOGLE_FORM_URL = os.getenv("GOOGLE_FORM_URL", "")
# Xendit sandbox — blank secret = stub mode (returns a fake QR for UI testing)
XENDIT_SECRET_KEY = os.getenv("XENDIT_SECRET_KEY", "")
XENDIT_WEBHOOK_TOKEN = os.getenv("XENDIT_WEBHOOK_TOKEN", "")
XENDIT_CALLBACK_URL = os.getenv("XENDIT_CALLBACK_URL", "")
# Multi-tenant: default restaurant for single-tenant mode
RESTAURANT_ID = os.getenv("RESTAURANT_ID", "default")
