"""
AI Agent for Meta-Koda multi-tenant restaurant SaaS.
Uses OpenAI gpt-4o-mini with function calling. The system prompt is built
dynamically per tenant — see `_build_system_prompt` below.

Capabilities via function calling:
- get_availability: Check table availability for a given date/time/pax
- create_booking: Create a reservation
- get_customer_profile: Look up loyalty points, tier, visit history
- get_menu: Retrieve current menu and prices
- escalate_to_human: Flag conversation for human agent
"""

import contextvars
import json
import re
import traceback
from datetime import datetime, timedelta

import httpx

from app.config import OPENAI_API_KEY
from app.db import get_db
from app.services.whatsapp import send_message

OPENAI_MODEL = "gpt-4o-mini"  # Fast and cheap, great for Indonesian

# ----------------------------------------------------------
# Multi-tenant context
# ----------------------------------------------------------
# `handle_incoming_message` resolves the receiving tenant from the WABA
# routing layer (PR 6) and stashes it in this contextvar. Every helper /
# tool function in this module reads it via `_tid()` to scope DB queries.
# When no tenant is resolvable (dev / unconfigured webhook), we fall back
# to the seed Buranchi tenant so single-tenant deployments keep working.
_FALLBACK_TENANT = "00000000-0000-0000-0000-000000000001"  # Buranchi seed UUID
_tenant_ctx: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "bot_tenant_ctx", default=None
)


def _tid() -> str:
    """Current tenant_id for bot DB scoping. Falls back to the seed Buranchi
    tenant when unset, so single-tenant deployments / dev keep working."""
    return _tenant_ctx.get() or _FALLBACK_TENANT


# ----------------------------------------------------------
# Markdown stripping — defensive post-process
# ----------------------------------------------------------
# gpt-4o-mini occasionally ignores the "no markdown" prompt rule and emits
# **bold** or *italic* in replies. The chat widget renders plain text, so
# the user sees literal asterisks. We strip emphasis markers from every
# outgoing message regardless of where the text came from (LLM, tool
# follow-up, fallback).

# **bold**, __bold__ — drop the markers, keep content
_BOLD_RE = re.compile(r"\*\*([^*\n]+?)\*\*")
_BOLD_UNDERSCORE_RE = re.compile(r"__([^_\n]+?)__")
# *italic*, _italic_ — only when NOT used as a bullet (must be followed by
# a non-space char and surrounded by word context)
_ITAL_STAR_RE = re.compile(r"(?<![\w*])\*([^\s*][^*\n]*?[^\s*])\*(?![\w*])")
_ITAL_UNDER_RE = re.compile(r"(?<![\w_])_([^\s_][^_\n]*?[^\s_])_(?![\w_])")


def _strip_markdown(text: str | None) -> str:
    """Remove markdown emphasis markers from bot replies.

    Cleans **bold**, __bold__, *italic*, _italic_. Leaves bullet hyphens,
    list numbers, emojis, and stand-alone asterisks (e.g. footnotes)
    untouched. Headings (`#`) on dedicated lines are also stripped since
    WhatsApp renders them as literal hashes.
    """
    if not text:
        return text or ""
    out = _BOLD_RE.sub(r"\1", text)
    out = _BOLD_UNDERSCORE_RE.sub(r"\1", out)
    out = _ITAL_STAR_RE.sub(r"\1", out)
    out = _ITAL_UNDER_RE.sub(r"\1", out)
    # Sweep up orphan ** that survived an unbalanced pair
    out = out.replace("**", "")
    # Strip leading "# ", "## ", "### " on lines (markdown headings)
    out = re.sub(r"(?m)^\s*#{1,6}\s+", "", out)
    return out


# Confirmation words — used by both the LLM prompt (string-form) and the
# safety-net fallback below to map "mantap"/"sip"/"oke deh" → "yes intent".
_CONFIRM_TOKENS = {
    "ya", "iya", "yaa", "oke", "okeoke", "okay", "okey", "ok", "sip",
    "sippp", "siap", "deal", "fix", "noted", "boleh", "bisa", "sabi",
    "gas", "gaspol", "kuy", "yuk", "ayuk", "ayo", "setuju", "mantap",
    "mantul", "mantab", "benar", "betul", "bener", "yoi", "yes",
    "yup", "yeah", "yaudah", "yowes", "lanjut", "konfirmasi",
}


def _parse_hhmm(s: str | None, fallback: int = 0) -> int:
    """Parse 'HH:MM' or 'HH' into minutes-since-midnight."""
    if not s:
        return fallback
    parts = s.strip().split(":")
    try:
        h = int(parts[0])
        m = int(parts[1]) if len(parts) > 1 else 0
        return h * 60 + m
    except (ValueError, IndexError):
        return fallback


def _format_hhmm(total_minutes: int) -> str:
    h = (total_minutes // 60) % 24
    m = total_minutes % 60
    return f"{h:02d}:{m:02d}"


def operating_hours(settings: dict) -> dict:
    """Derive the canonical operating-hour math from a tenant's settings.

    Closing time is the source of truth:
      • last_order   = closing - 30 minutes
      • last_booking = closing - 60 minutes  (= last_order - 30)

    `opening_hours` is stored as "HH:MM - HH:MM". `last_order` in the
    settings row is treated as a display hint only — we always re-derive
    from closing so the three values can never drift apart.
    """
    raw = (settings.get("opening_hours") or "11:00 - 22:00").strip()
    open_str, close_str = "11:00", "22:00"
    if " - " in raw:
        open_str, close_str = (s.strip() for s in raw.split(" - ", 1))
    open_min = _parse_hhmm(open_str, 11 * 60)
    close_min = _parse_hhmm(close_str, 22 * 60)
    last_order_min = close_min - 30
    last_booking_min = close_min - 60  # one hour before closing
    return {
        "open_min": open_min,
        "close_min": close_min,
        "last_order_min": last_order_min,
        "last_booking_min": last_booking_min,
        "open_str": _format_hhmm(open_min),
        "close_str": _format_hhmm(close_min),
        "last_order_str": _format_hhmm(last_order_min),
        "last_booking_str": _format_hhmm(last_booking_min),
        "hours_str": f"{_format_hhmm(open_min)} - {_format_hhmm(close_min)}",
    }


def _is_confirmation(message: str) -> bool:
    """Detect when a customer reply is essentially 'yes/agreed' so we can
    keep them out of the generic-menu fallback when the LLM choked."""
    if not message:
        return False
    cleaned = re.sub(r"[^\w\s]", "", message.lower()).strip()
    if cleaned in _CONFIRM_TOKENS:
        return True
    # "oke deh", "oke kak", "hm sip", "hmm oke" etc. — first or last word
    # is a confirm token and the whole message is short.
    parts = cleaned.split()
    if 0 < len(parts) <= 3:
        if parts[0] in _CONFIRM_TOKENS or parts[-1] in _CONFIRM_TOKENS:
            return True
    # "iya sudah benar", "oke sudah benar", "ya benar", etc. — confirm
    # token anywhere within a short message.
    if 0 < len(parts) <= 4:
        if any(p in _CONFIRM_TOKENS for p in parts):
            return True
    return False


# ----------------------------------------------------------
# Deterministic booking parser — for the LLM-failed code path
# ----------------------------------------------------------
# When the LLM choked mid-flow on a booking confirmation, we used to
# reply with a placebo "lagi diproses" message and never actually create
# the booking. The user expects instant booking on confirm — this set of
# helpers parses the bot's prior confirmation message and creates the
# booking directly through the same _tool_create_booking the LLM would
# have called.

_INDO_MONTHS = {
    "januari": 1, "februari": 2, "maret": 3, "april": 4, "mei": 5,
    "juni": 6, "juli": 7, "agustus": 8, "september": 9, "oktober": 10,
    "november": 11, "desember": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7,
    "ags": 8, "agu": 8, "sep": 9, "okt": 10, "nov": 11, "des": 12,
}


def _resolve_date(text: str) -> str:
    """Normalize 'Besok', 'Lusa', 'Hari ini', '7 Mei 2026', '2026-05-07'
    to YYYY-MM-DD. Returns '' when nothing parses cleanly."""
    if not text:
        return ""
    t = text.lower().strip()
    today = datetime.now().date()
    if "besok" in t or "tomorrow" in t:
        return (today + timedelta(days=1)).isoformat()
    if "lusa" in t:
        return (today + timedelta(days=2)).isoformat()
    if "hari ini" in t or "today" in t:
        return today.isoformat()
    m = re.search(r"(\d{4}-\d{2}-\d{2})", text)
    if m:
        return m.group(1)
    m = re.search(r"(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?", text)
    if m:
        try:
            day = int(m.group(1))
            month = _INDO_MONTHS.get(m.group(2).lower())
            year = int(m.group(3)) if m.group(3) else today.year
            if month:
                d = datetime(year, month, day).date()
                if d < today:
                    d = datetime(year + 1, month, day).date()
                return d.isoformat()
        except (ValueError, IndexError):
            pass
    return ""


def _parse_confirm_prompt(text: str) -> dict:
    """Extract booking fields from a bot confirmation message of the
    "Tanggal: …, Jam: …, Jumlah Orang: …, Area: …, Meja: …" shape."""
    if not text:
        return {}
    fields: dict = {}
    pairs = [
        ("date_text", r"Tanggal\s*:\s*(.+?)(?:\n|$)"),
        ("time", r"Jam\s*:\s*(\d{1,2}[:\.]\d{2})"),
        ("pax", r"(?:Jumlah\s*Orang|Pax|Orang)\s*:\s*(\d+)"),
        ("area", r"Area\s*:\s*(.+?)(?:\n|$)"),
        ("table_id", r"Meja\s*:\s*([\w\-]+)"),
        ("guest_name", r"Nama\s*:\s*(.+?)(?:\n|$)"),
        ("notes_alergi", r"(?:Alergi)\s*:\s*(.+?)(?:\n|$)"),
        ("notes_catatan", r"(?:Catatan|Notes|Permintaan)\s*:\s*(.+?)(?:\n|$)"),
    ]
    for key, pattern in pairs:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            fields[key] = m.group(1).strip()
    if "time" in fields:
        fields["time"] = fields["time"].replace(".", ":")
    if "pax" in fields:
        try:
            fields["pax"] = int(fields["pax"])
        except (ValueError, TypeError):
            del fields["pax"]
    # Merge the various note fields into one string. "Tidak ada"/"-" mean none.
    notes_parts = []
    for k in ("notes_alergi", "notes_catatan"):
        v = fields.pop(k, "")
        if v and v.lower() not in ("tidak ada", "-", "none", "tidak", "no"):
            label = "alergi" if k == "notes_alergi" else "catatan"
            notes_parts.append(f"{label}: {v}")
    fields["notes"] = "; ".join(notes_parts)
    return fields


def _try_create_booking_from_history(
    last_bot_message: str,
    customer_phone: str,
) -> dict:
    """Parse the bot's prior confirmation message and create the booking
    deterministically. Returns {"ok": bool, ...details} so the fallback
    can give an honest reply instead of a placebo "diproses" message."""
    if not last_bot_message or not customer_phone:
        return {"ok": False, "reason": "missing-context"}

    fields = _parse_confirm_prompt(last_bot_message)
    date = _resolve_date(fields.get("date_text", ""))
    time_str = fields.get("time", "")
    pax = fields.get("pax")
    if not (date and time_str and pax):
        return {"ok": False, "reason": "incomplete-fields", "fields": fields}

    db = get_db()
    cust_rows = db.table("customers").select(
        "id, name"
    ).eq("tenant_id", _tid()).eq("phone", customer_phone).limit(1).execute().data
    if not cust_rows:
        return {"ok": False, "reason": "customer-not-found"}
    customer_id = cust_rows[0]["id"]
    guest_name = fields.get("guest_name") or cust_rows[0]["name"] or "Guest"

    # Pick a table — honor an explicit "Meja: TO-1" first, otherwise
    # find any free table that fits the requested area + pax.
    table_id = fields.get("table_id", "")
    if not table_id:
        area = (fields.get("area") or "").lower()
        all_tables = db.table("tables").select(
            "id, capacity, zone, status"
        ).eq("tenant_id", _tid()).gte("capacity", pax).execute().data or []

        # Bookings already on that slot
        booked = db.table("bookings").select("table_id").eq(
            "tenant_id", _tid()
        ).eq("date", date).eq("time", time_str).in_(
            "status", ["reserved", "occupied"],
        ).execute().data or []
        booked_ids = {b["table_id"] for b in booked}

        def zone_matches(zone_lower: str, area_lower: str) -> bool:
            if not area_lower:
                return True
            if area_lower in zone_lower or zone_lower in area_lower:
                return True
            # outdoor synonyms
            outdoor_zones = ("teras", "pool", "outdoor", "garden")
            if "outdoor" in area_lower and any(k in zone_lower for k in outdoor_zones):
                return True
            if "indoor" in area_lower and not any(k in zone_lower for k in outdoor_zones):
                return True
            return False

        for t in sorted(all_tables, key=lambda x: x["capacity"]):
            if t["id"] in booked_ids:
                continue
            if t.get("status") in ("occupied", "cleaning"):
                continue
            if zone_matches((t.get("zone") or "").lower(), area):
                table_id = t["id"]
                break

    if not table_id:
        return {"ok": False, "reason": "no-table-available"}

    result = _tool_create_booking(
        customer_id=customer_id,
        date=date,
        time=time_str,
        pax=pax,
        table_id=table_id,
        guest_name=guest_name,
        notes=fields.get("notes", ""),
    )
    if not result.get("success"):
        return {"ok": False, "reason": "create-failed", "error": result.get("error")}

    return {
        "ok": True,
        "booking_id": result.get("booking_id"),
        "date": date,
        "time": time_str,
        "table_id": table_id,
        "pax": pax,
        "area": fields.get("area", ""),
    }


def _build_system_prompt(business_name: str) -> str:
    """Substitute the tenant's business name into every {BIZ} placeholder
    in the system prompt template. Bot will then introduce itself as
    "Koda dari <business_name>" instead of always saying "Buranchi"."""
    safe = (business_name or "Restoran").strip() or "Restoran"
    return _SYSTEM_PROMPT_TEMPLATE.replace("{BIZ}", safe)

_SYSTEM_PROMPT_TEMPLATE = """Kamu adalah "Koda", asisten virtual restoran {BIZ}.
Kamu adalah Meta-Koda Intelligence Core (MIC) — mengelola lifecycle customer dari inquiry sampai post-dining untuk restoran {BIZ}.

⚡ ATURAN WAJIB #1 — TANYA NAMA DI PESAN PEMBUKA:
Jika context berisi [NEEDS_NAME: true], maka balasan PERTAMA kamu di sesi ini WAJIB mengandung pertanyaan nama customer.
Aturan ini MENGALAHKAN history percakapan — walaupun di riwayat chat sebelumnya kamu (bot) tidak menanyakan nama, kamu HARUS menanyakannya SEKARANG karena context saat ini mengatakan NEEDS_NAME=true.
Bentuk pertanyaan natural: "boleh tahu nama Kakak?", "panggil Kakak siapa ya?", "atas nama siapa ya Kak?".
JANGAN skip pertanyaan ini jika NEEDS_NAME=true. JANGAN sapa generik "Halo Kak!" saja tanpa ajakan menyebutkan nama.

GAYA BAHASA:
- Bahasa Indonesia semi-formal, hangat, ramah, dan ekspresif — seperti host restoran yang welcoming, bukan robot customer service.
- Sapa customer dengan "Kak" + nama (kalau sudah diketahui). Gunakan kata sapaan yang menyenangkan: "Halo", "Hai", "Selamat datang", "Senang dengar dari Kak".
- Empati dulu sebelum solusi: kalau customer bingung/ragu, akui dulu ("Wajar Kak…", "Aku ngerti…") sebelum kasih jawaban.
- Konfirmasi yang ditangkap: ulang ringkas apa yang customer sampaikan ("Oke, jadi besok jam 7 untuk 3 orang ya Kak — bener?") — supaya customer merasa didengar.
- BAHASA OUTPUT: Sopan dan ringan. JANGAN pakai slang kasar/gaul dalam BALASAN (jangan output: "gaspol", "mantul", "bet", "anjir", "wkwk berlebihan"). Tetap clean.
- TAPI HARUS MEMAHAMI 100% slang & gaya bahasa modern customer Indonesia, dan respons natural seolah-olah ngerti vibes-nya.
- KAMUS SLANG (kamu HARUS recognize, treat sebagai equivalent kata standar):
  • Konfirmasi/setuju: "mantap", "mantul", "mantab", "sip", "sippp", "siap", "oke", "okeoke", "okesip", "oke deh", "oke kak", "deal", "fix", "noted", "yoi", "yo", "boleh", "boleh juga", "bisa", "sabi", "gas", "gaspol", "kuy", "yuk", "ayuk", "ayo", "setuju", "betul", "bener", "yes", "yup", "yeah", "hm oke", "hmm sip".
  • Penolakan/skip: "nggak", "gak", "engga", "enggak", "nope", "skip", "ga jadi", "cancel", "batal", "ga deh".
  • Pronoun: "gue/gw" = saya, "lo/lu" = kamu, "ku/aku" = saya.
  • Waktu: "ntar"=nanti, "bsk"=besok, "pgi"=pagi, "mlm"=malam, "skrg"=sekarang, "otw"=on the way.
  • Aktivitas: "nongki"=nongkrong, "mager"=malas gerak, "gacor"=ramai/bagus, "vibe"=suasana, "kepo"=ingin tahu.
  • Kondisi: "bokek"=tidak punya uang, "santuy"=santai, "gercep"=gerak cepat.
- Sopan walau customer pakai bahasa kasar atau singkat banget.
- Informatif: kalau menolak/mengusulkan opsi, sertakan alasan singkat + langkah berikutnya yang jelas.
- Panjang: 2–4 kalimat. Emoji boleh 1, maksimal 2 — untuk kehangatan, bukan pengganti kata.

FORMAT BALASAN:
- Tulis seperti mengobrol di WhatsApp. Prosa yang mengalir, BUKAN format brosur/formulir.
- ⚠️⚠️⚠️ DILARANG KERAS PAKAI MARKDOWN: JANGAN gunakan `**`, `*`, `_`, `__`, `#`, atau backtick di output mana pun. Customer melihat plain text — markdown berubah jadi literal asterisks dan terlihat sangat tidak profesional. Ini ATURAN MUTLAK.
  • SALAH: "Mau di **Indoor** atau **Outdoor**?" / "Tersedia **Mie Aceh** dengan harga *Rp 62.000*" / "**Appetizer:** Crispy Skin"
  • BENAR: "Mau di Indoor atau Outdoor?" / "Tersedia Mie Aceh dengan harga Rp 62.000" / "Appetizer: Crispy Skin"
- Untuk emphasis (penekanan), pakai pilihan kata atau urutan kalimat — JANGAN pakai bold/italic.
- Hindari daftar bullet ("- ...") atau numbered list ("1. ...") untuk greeting, pertanyaan, atau penolakan. Sebutkan opsi dalam kalimat (contoh: "mau jam 19:00, 19:30, atau 20:00?").
- Pengecualian — list diperbolehkan hanya untuk:
  (a) konfirmasi detail booking yang final (Meja, Tanggal, Jam, Jumlah Orang, Catatan),
  (b) output `get_menu` yang memang panjang.
  Di luar itu, tetap prosa.
- Boleh pakai line break untuk memisahkan paragraf jika balasan 3+ kalimat, tapi jangan berlebihan.

PESAN PEMBUKA:
- Saat customer menyapa ("halo", "hai", "hi"), balas hangat, perkenalkan diri singkat, dan ajak ngobrol — mengalir, TANPA list.
- Jika customer baru (NEEDS_NAME: true), SELALU selipkan pertanyaan nama di pesan pembuka yang SAMA, supaya tidak perlu tanya lagi di round berikutnya. Pertanyaan nama ditaruh di akhir, dalam kalimat terpisah yang natural.
  • Contoh lengkap (greeting + service + nama, NEEDS_NAME=true):
    "Halo Kak! Aku Koda, asisten dari {BIZ} 👋 Ada yang bisa dibantu hari ini? Mau booking meja atau tanya-tanya menu? Oh iya, boleh tahu nama Kakak dulu biar obrolannya lebih enak 😊"
  • Contoh lain (NEEDS_NAME=true):
    "Hai Kak! Senang kenalan, aku Koda dari {BIZ}. Lagi cari info apa nih — booking, menu, atau poin membership? Sebelum itu, panggil Kakak siapa ya?"
- Jika nama sudah ada di context (NEEDS_NAME=false), JANGAN tanya nama. Langsung sapa pakai nama mereka.
  • Contoh (NEEDS_NAME=false, nama = Marchel):
    "Halo Kak Marchel! Aku Koda dari {BIZ} 👋 Ada yang bisa dibantu hari ini? Mau booking meja atau tanya-tanya menu?"

INTENT HANDLING:
1. BOOKING — Detect: "book", "reservasi", "meja", "pesan", "mau makan", "ntar malem"
   → Step-by-step booking flow (JANGAN skip step, JANGAN auto-confirm tanpa preferensi seating + notes):
     a. Kumpulkan basic info: Tanggal, Jam, Jumlah orang.
     b. Panggil `get_availability` untuk cek meja.
     c. SETELAH meja tersedia, TANYAKAN PREFERENSI AREA DUDUK dalam KATEGORI — JANGAN list semua meja satu per satu. `get_availability` mengembalikan field `categories` (indoor/outdoor) dan `zones` (nama zona detail seperti "Teras Otella", "Poolside", "Indoor Otella"). Tawarkan customer dalam 2 level:
       • Level 1 (selalu): tanyakan kategori dulu — "Mau yang indoor atau outdoor, Kak?". Cek `categories.indoor.available` dan `categories.outdoor.available` — kalau salah satu false, jangan tawarkan.
       • Level 2 (kalau customer tanya detail atau zona indoor/outdoor punya banyak sub-zona): sebutkan zona-nya. Contoh kalau customer pilih outdoor dan ada Teras Otella + Poolside, tanyakan: "Mau di Teras Otella atau Poolside, Kak?".
       • JANGAN list TO-1, TO-2, TO-3, dst. ke customer. Itu detail internal — customer cuma butuh tahu pilihan area.
     PENTING: zona dengan kata "teras", "pool", "outdoor", "garden" = OUTDOOR. Zona dengan kata "indoor" / lainnya = INDOOR. Jadi kalau customer tanya "ada outdoor?", cek `categories.outdoor.available`, JANGAN bilang tidak ada hanya karena tidak ada zona literal bernama "Outdoor".
     d. SETELAH customer pilih area (atau bilang "bebas"/"terserah"), TANYAKAN REQUEST KHUSUS dengan satu kalimat singkat — contoh: "Ada request khusus, Kak? Misalnya alergi makanan, kursi bayi, perayaan ulang tahun, atau kebutuhan lain — kalau tidak ada juga gak apa." JANGAN skip step ini.
     e. Pilih meja dari area pilihan customer (kalau "bebas", ambil yang pertama tersedia).
     f. Konfirmasi LENGKAP semua detail dalam satu kalimat list: Tanggal, Jam, Jumlah Orang, Area, Meja, Nama, Notes (kalau ada).
     g. Tunggu customer bilang "ya"/"oke"/"benar" → panggil `create_booking` (dengan field `notes` terisi dari step d).
   → If conflict detected, suggest next 3 closest available slots.
   → JIKA customer dari awal sudah kasih semua info termasuk preferensi area + notes, silahkan langsung ke step f tanpa nanya ulang.

1b. CANCEL / CHECK BOOKING — Detect: "batal", "cancel", "gabisa dateng", "booking saya yang mana"
   → ALWAYS call `list_customer_bookings` FIRST to see what bookings they actually have. JANGAN menebak atau bilang "tidak ada reservasi" tanpa memanggil tool ini.
   → If `list_customer_bookings` returns empty, baru bilang tidak ada reservasi aktif.
   → If returns one booking, konfirmasi detail-nya (tanggal, jam, meja) lalu panggil `cancel_booking` setelah customer setuju.
   → If returns multiple, sebutkan semuanya dan tanya yang mana mau dibatalkan sebelum memanggil `cancel_booking`.

1c. MODIFY BOOKING (TAMBAH ORANG / GANTI MEJA / GANTI JAM / GANTI TANGGAL / TAMBAH NOTES)
   Detect: "mau nambah X orang", "tiba-tiba jadi X orang", "ganti meja", "pindah jam", "ganti tanggal", "tambahin notes / catatan", "alergi", "ada tambahan"
   ⚠️ JANGAN PERNAH cancel + create_booking ulang. Pakai `modify_booking` — ini in-place update. Kalau kamu cancel duluan, mejanya release dan bisa direbut customer lain dalam detik berikutnya.
   Flow:
     a. Panggil `list_customer_bookings` untuk dapat booking_id (kalau ada lebih dari 1, tanya customer yang mana).
     b. Identifikasi field yang berubah:
        • Tambah orang → `party_size` baru. Kalau > kapasitas meja saat ini, juga butuh `table_id` baru.
        • Ganti jam/tanggal → `time` / `date`. Cek availability dulu.
        • Update notes → `notes` saja.
     c. Kalau perlu meja baru: panggil `get_availability` dengan pax baru + tanggal+jam. JANGAN ngarang nama meja.
     d. Konfirmasi perubahan dengan customer (sebutkan: dari X orang/meja Y → jadi N orang/meja Z).
     e. SETELAH customer setuju → panggil `modify_booking` dengan HANYA field yang berubah + booking_id.
     f. Sampaikan hasilnya ringkas (booking_id, jam, meja baru).
   Contoh urutan tool calls untuk "saya jadi 5 orang nih, awalnya 1 di PS-4":
     1. list_customer_bookings → ambil booking_id
     2. get_availability(date, time, pax=5) → lihat zones.outdoor / kategori
     3. konfirmasi ke customer mejanya pindah ke PL-2 (kapasitas 6)
     4. customer setuju → modify_booking(booking_id, party_size=5, table_id="PL-2")
   ⚠️ ATURAN MUTLAK: ketika modify, JANGAN ulang menyebutkan opsi meja yang sama berkali-kali. Kalau sudah dipilih, langsung modify_booking. Jangan oscillate.
   ⚠️⚠️⚠️ DILARANG KLAIM SUKSES TANPA TOOL CALL. Kalau kamu bilang "Reservasi sudah berhasil diperbarui" / "berhasil diupdate" / "sudah saya ubah" / "sudah dimodifikasi" — kamu HARUS sudah benar-benar memanggil `modify_booking` dan menerima `success: true` dari result-nya. JANGAN halusinasi sukses. Kalau tool belum dipanggil di turn yang sama, JANGAN ucapkan kalimat sukses — panggil tool-nya dulu. Kalau tool return `success: false`, sampaikan error-nya ke customer secara jujur, jangan dibuat seolah-olah berhasil.

2. MENU — Detect: "menu", "makan apa", "harga", "recommend", "enak"
   → Use get_menu tool to show current menu.

3. LOYALTY — Detect: "poin", "point", "reward", "member", "tier"
   → Use get_customer_profile tool to show their points/tier/rewards.

4. COMPLAINT — Detect: negative sentiment, "kecewa", "jelek", "lama", "mahal", "complain"
   → Use escalate_to_human tool. Empathize first, then escalate.

5. GENERAL — Hours, location, promo
   → Answer directly from knowledge.

RULES:
- Jangan buat janji yang tidak bisa ditepati.
- Untuk booking, SELALU confirm detail sebelum create_booking. WAJIB sudah tanyakan preferensi area + request khusus dulu.
- Jika di luar scope restoran, bilang: "Maaf Kak, saya hanya bisa membantu untuk reservasi dan informasi seputar {BIZ}."
- Jika request kurang lengkap (misal "mau pesen meja"), tanyakan: Tanggal, Jam, Jumlah orang.
- Jika context menunjukkan [NEEDS_NAME: true], tanyakan nama customer dengan cara yang NATURAL, singkat, dan langsung. Tapi jika nama sudah ada di context, JANGAN tanya lagi.
  • Contoh natural (pakai salah satu ini, jangan ubah jadi kaku): "Atas nama siapa ya Kak?", "Boleh tahu nama Kakak dulu?", "Reservasinya atas nama siapa Kak?"
  • JANGAN pakai frasa kaku/formal seperti "Apakah nama Kakak yang akan dicatat untuk reservasi ini?", "Mohon informasi nama lengkap untuk keperluan reservasi", atau kalimat tanya tidak langsung semacamnya. Terdengar seperti formulir.
- PENTING NAMA: Ketika customer memberikan nama mereka (contoh: "Joshua", "nama saya Marchelino", "saya Budi", "atas nama Marchel"), SEGERA panggil tool `update_customer_name` untuk menyimpan nama tersebut ke database. Setelah itu baru lanjutkan percakapan dengan menyapa mereka pakai nama.
- Jika customer sudah memberikan SEMUA detail booking (tanggal, jam, jumlah orang, nama, area duduk, dan notes/permintaan khusus atau eksplisit "tidak ada notes"), langsung lanjut ke step konfirmasi (step f). Jika ada yang kurang — terutama area duduk atau notes — TANYAKAN dulu sebelum confirm.
- PENTING: SEMUA kata konfirmasi setelah pesan konfirmasi (step f) memicu `create_booking` SEGERA. Daftar trigger (case-insensitive, anggap semua = "ya"):
  "ya", "iya", "yaa", "oke", "okeoke", "okay", "okey", "ok", "sip", "sippp", "siap", "deal", "fix", "noted", "boleh", "bisa", "sabi", "gas", "gaspol", "kuy", "yuk", "ayuk", "ayo", "setuju", "mantap", "mantul", "mantab", "benar", "betul", "bener", "yoi", "yes", "yup", "yeah", "hm oke", "hmm sip", "oke deh", "oke kak", "yaudah", "yowes", "lanjut", "konfirmasi".
  Kalau confirmation message (step f) sudah dikirim dan customer balas dengan SALAH SATU di atas → langsung panggil `create_booking`. JANGAN balas dengan greeting baru atau menu. JANGAN tanya ulang.
- Tapi jika confirmation message BELUM dikirim (mis. masih ada area atau notes yang belum dikonfirmasi), JANGAN langsung create_booking — tanyakan dulu yang kurang.
- Jika jumlah tamu melebihi kapasitas meja terbesar, informasikan kapasitas meja yang tersedia dan sarankan untuk menyesuaikan jumlah tamu.
- Jika customer menyebutkan alergi, preferensi makanan, atau request khusus (misalnya "alergi kacang", "vegetarian", "high chair"), catat di notes saat create_booking. Jawab dengan sopan bahwa request akan dicatat.
- TANGGAL: Gunakan [TODAY] dan [TOMORROW] dari context. Jika customer bilang "tanggal 20" tanpa tahun, SELALU gunakan bulan dan tahun yang terdekat dari hari ini. JANGAN tanyakan tahun.
- ⚠️ JANGAN PERNAH BILANG "TUNGGU SEBENTAR" / "AKU CEK DULU" / "MOHON TUNGGU" TANPA LANGSUNG MEMANGGIL TOOL DI TURN YANG SAMA. Tool call HARUS dilakukan di turn yang sama dengan pesan promise-nya, atau lebih baik lagi: panggil tool DULU lalu sampaikan hasilnya — tanpa filler "tunggu". Customer cuma melihat 1 turn dari kamu; kalau kamu bilang "tunggu" tapi tidak pernah follow up dengan hasil, customer akan mikir bot crash. Aturan:
  • Kalau butuh data dari tool (cek availability, cek poin, lihat menu, lihat booking) → PANGGIL TOOL SEKARANG, jangan nunda.
  • Kalau belum cukup info → tanya pertanyaan, JANGAN bilang "tunggu" dulu.
  • DILARANG: "Sekarang aku akan cek ketersediaan meja, tunggu ya 😊" tanpa tool call.
  • BENAR: panggil `get_availability` → lalu balas dengan hasilnya.
- INGAT DETAIL: Customer sering nyebut detail booking secara bertahap di beberapa pesan. Kalau customer udah pernah nyebut tanggal, jam, jumlah orang, area, atau alergi DI MANAPUN dalam history percakapan ini — JANGAN tanya ulang. Selalu scan SEMUA pesan customer sebelumnya sebelum tanya. Contoh:
  • Customer turn 1: "buat besok ya jam 7 malam"
  • Customer turn 2: "4 orang"
  • Bot turn 3 (SALAH): "jam berapa ya Kak?" — karena udah dijawab di turn 1.
  • Bot turn 3 (BENAR): langsung lanjut ke konfirmasi area dengan data yang udah ada (tanggal=besok, jam=19:00, pax=4).
- JAM OPERASIONAL (SUMBER KEBENARAN: closing time):
  • Last order = closing − 30 menit (otomatis).
  • Reservasi terakhir = closing − 60 menit (= 1 jam sebelum tutup, otomatis).
  • Contoh kalau tutup jam 22:00: last order 21:30, reservasi terakhir bisa untuk jam 21:00 (inklusif).
  • Yang DITOLAK hanya jam SETELAH "reservasi terakhir" (mis. 21:01 ke atas kalau tutup 22:00).
  • JANGAN pernah menolak jam yang persis sama dengan last_booking. Selalu panggil `get_availability` dulu — biarkan tool yang memutuskan.
- JANGAN menolak waktu reservasi berdasarkan aturan di atas tanpa memanggil `get_availability` terlebih dahulu. Biarkan tool yang memutuskan available atau tidak; kamu hanya menyampaikan hasilnya.
- KAPASITAS:
  • Kapasitas meja TERBESAR di restoran ini bisa kamu lihat dari `available_capacities` di hasil `get_availability`. Pakai info itu, JANGAN ngarang kapasitas.
  • Kalau party_size MASIH MUAT di satu meja (≤ kapasitas meja terbesar yang available), pakai meja itu — JANGAN tawarkan split. Contoh: 9 orang muat di meja indoor 10-pax → langsung tawarkan meja 10-pax tersebut, jangan suruh split.
  • Kalau party_size MELEBIHI semua single-table (mis. 12 orang sementara meja terbesar 10) → minta customer koordinasi langsung dengan staff via telepon (sebutkan nomor restoran dari context); JANGAN coba bikin booking gabungan sendiri di chat. Restoran punya operasional manual untuk grup besar — bot tidak handle merging.
- ⚠️ DILARANG MENGARANG STATUS MEJA. JANGAN bilang meja "sudah terpakai" / "sudah dibooking" / "tidak tersedia" tanpa hasil tool yang mendukung. `get_availability` hanya mengembalikan meja yang AVAILABLE — kalau sebuah meja tidak muncul, itu bukan otomatis "sudah terpakai" (mungkin memang tidak ada untuk pax tsb). Cukup sebutkan meja yang tersedia, jangan jelaskan yang nggak ada.
- ⚠️ MATEMATIKA HARUS BENAR. Kalau menawarkan kombinasi meja, jumlah kapasitasnya HARUS ≥ party_size. Contoh untuk 9 orang: PS-1 (2) + PS-2 (2) = 4, NGGAK CUKUP. Yang valid: PL-1 (6) + TO-1 (4) = 10. Tapi seperti aturan di atas — kalau ada single table 10-pax yang muat, pakai itu daripada split.
"""

# Tools for Claude to call
TOOLS = [
    {
        "name": "get_availability",
        "description": "Check table availability for a specific date, time, and party size. Returns available tables with capacity and zone info. Use this when customer wants to book or asks about availability.",
        "input_schema": {
            "type": "object",
            "properties": {
                "date": {"type": "string", "description": "Date in YYYY-MM-DD format"},
                "time": {"type": "string", "description": "Time in HH:MM format (24h)"},
                "pax": {"type": "integer", "description": "Number of people"},
            },
            "required": ["date", "time", "pax"],
        },
    },
    {
        "name": "create_booking",
        "description": "Create a reservation after customer confirms all details. Only call this after explicitly confirming date, time, pax, and guest name with the customer.",
        "input_schema": {
            "type": "object",
            "properties": {
                "customer_id": {"type": "string", "description": "Customer UUID"},
                "date": {"type": "string", "description": "Date in YYYY-MM-DD format"},
                "time": {"type": "string", "description": "Time in HH:MM format"},
                "pax": {"type": "integer", "description": "Party size"},
                "table_id": {"type": "string", "description": "Table ID (e.g. A1, B2)"},
                "guest_name": {"type": "string", "description": "Guest name for the reservation"},
                "notes": {"type": "string", "description": "Special requests or notes"},
            },
            "required": ["customer_id", "date", "time", "pax", "table_id", "guest_name"],
        },
    },
    {
        "name": "get_customer_profile",
        "description": "Look up a customer's loyalty profile: points, tier, total visits, total spent. Use when customer asks about their points, tier, or membership status.",
        "input_schema": {
            "type": "object",
            "properties": {
                "phone": {"type": "string", "description": "Customer phone number"},
            },
            "required": ["phone"],
        },
    },
    {
        "name": "get_menu",
        "description": "Get the current restaurant menu with prices and categories. Use when customer asks about food, prices, or recommendations.",
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "description": "Filter by category: Main, Beverage, Dessert. Leave empty for all.",
                    "enum": ["Main", "Beverage", "Dessert"],
                },
            },
            "required": [],
        },
    },
    {
        "name": "update_customer_name",
        "description": "Save the customer's name to the database. Call this IMMEDIATELY when the customer provides their name in the conversation (e.g. 'nama saya Joshua', 'Joshua', 'panggil saya Budi', 'Marchelino'). Only save real human names, not greetings or other messages.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "The customer's name. Capitalize properly (e.g. 'Joshua Gifensius', 'Marchelino Linardi'). Only include the name itself, no titles or extra words.",
                },
            },
            "required": ["name"],
        },
    },
    {
        "name": "escalate_to_human",
        "description": "Escalate conversation to a human agent. Use for complaints, complex issues, or when customer explicitly asks for a human.",
        "input_schema": {
            "type": "object",
            "properties": {
                "reason": {"type": "string", "description": "Brief reason for escalation"},
            },
            "required": ["reason"],
        },
    },
    {
        "name": "list_customer_bookings",
        "description": "List this customer's upcoming and recent reservations (today and the next 14 days, plus any still reserved/occupied). ALWAYS call this first when the customer asks to cancel, reschedule, or check the status of their booking — do not guess whether a booking exists.",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "cancel_booking",
        "description": "Cancel an existing reservation. Only call this AFTER list_customer_bookings has returned the booking_id the customer wants to cancel, and AFTER the customer has confirmed the specific booking (date + time + table). Cancelling releases the table immediately.",
        "input_schema": {
            "type": "object",
            "properties": {
                "booking_id": {"type": "string", "description": "UUID of the booking to cancel (from list_customer_bookings output)."},
            },
            "required": ["booking_id"],
        },
    },
    {
        "name": "modify_booking",
        "description": (
            "Modify an existing reservation in place. Use this — NOT cancel + create_booking — "
            "when the customer wants to add/remove people, change time, change date, change "
            "the table, or update notes on a booking that already exists. "
            "Workflow: (1) list_customer_bookings to find the booking_id, "
            "(2) if party_size goes up and won't fit the current table, call get_availability "
            "with the new pax/date/time to pick a new table_id, "
            "(3) confirm the changes with the customer, then call modify_booking with ONLY "
            "the fields that changed. "
            "Pass party_size and table_id together when growing the party. The tool will "
            "refuse if the new table can't fit the new pax."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "booking_id": {"type": "string", "description": "UUID of the existing booking."},
                "party_size": {"type": "integer", "description": "New party size, if changed."},
                "table_id": {"type": "string", "description": "New table id (e.g. PL-2), if the table is changing."},
                "time": {"type": "string", "description": "New HH:MM time, if changed."},
                "date": {"type": "string", "description": "New YYYY-MM-DD date, if changed."},
                "notes": {"type": "string", "description": "Updated notes — set to empty string to clear."},
            },
            "required": ["booking_id"],
        },
    },
]


def _get_openai_tools():
    """Convert TOOLS to OpenAI function calling format."""
    return [
        {
            "type": "function",
            "function": {
                "name": tool["name"],
                "description": tool["description"],
                "parameters": tool["input_schema"],
            },
        }
        for tool in TOOLS
    ]


# --- Tool implementations ---

def _tool_get_availability(date: str, time: str, pax: int) -> dict:
    """Check available tables for the given date/time/pax."""
    db = get_db()

    # Check operating hours — closing time is the source of truth, with
    # last_order = closing-30min and last_booking = closing-60min derived
    # canonically by `operating_hours()`.
    settings = _get_restaurant_settings()
    days_open = settings.get("days_open", "Setiap hari")
    hrs = operating_hours(settings)
    req_min = _parse_hhmm(time, fallback=-1)

    if req_min >= 0 and (req_min < hrs["open_min"] or req_min > hrs["last_booking_min"]):
        return {
            "available": False,
            "tables": [],
            "reason": f"Jam {time} di luar waktu reservasi yang tersedia.",
            "operating_hours": hrs["hours_str"],
            "last_order": hrs["last_order_str"],
            "latest_reservation": hrs["last_booking_str"],
            "days_open": days_open,
            "suggestion": (
                f"Restoran buka {days_open} jam {hrs['hours_str']}, "
                f"last order jam {hrs['last_order_str']}. Reservasi terakhir "
                f"bisa dilakukan untuk jam {hrs['last_booking_str']} "
                f"(1 jam sebelum tutup). Silakan pilih jam antara "
                f"{hrs['open_str']} - {hrs['last_booking_str']}."
            ),
        }

    # Get ALL tables to show capacity info
    every_table = db.table("tables").select("id, capacity, zone").eq(
        "tenant_id", _tid()
    ).order("capacity").execute().data
    all_capacities = sorted(set(t["capacity"] for t in every_table))
    max_capacity = max(all_capacities) if all_capacities else 0

    # If requested pax exceeds max capacity, inform immediately
    if pax > max_capacity:
        return {
            "available": False,
            "tables": [],
            "reason": f"Jumlah tamu ({pax} orang) melebihi kapasitas meja terbesar kami ({max_capacity} orang).",
            "available_capacities": all_capacities,
            "suggestion": f"Kapasitas meja yang tersedia: {', '.join(str(c) + ' orang' for c in all_capacities)}. Silakan sesuaikan jumlah tamu atau bagi ke beberapa meja.",
        }

    # Get tables with enough capacity
    suitable_tables = [t for t in every_table if t["capacity"] >= pax]

    # Get bookings that overlap (same date)
    booked = db.table("bookings").select("table_id").eq(
        "tenant_id", _tid()
    ).eq("date", date).in_("status", ["reserved", "occupied"]).execute().data
    booked_ids = {b["table_id"] for b in booked}

    # Also exclude tables in cleaning state
    cleaning = db.table("tables").select("id").eq(
        "tenant_id", _tid()
    ).eq("status", "cleaning").execute().data
    cleaning_ids = {t["id"] for t in cleaning}

    available = [
        {"id": t["id"], "capacity": t["capacity"], "zone": t["zone"]}
        for t in suitable_tables
        if t["id"] not in booked_ids and t["id"] not in cleaning_ids
    ]

    if available:
        # Group available tables by zone, and roll zones up into broad
        # categories the LLM can offer the customer in a single line —
        # restaurant zones map to Indoor/Outdoor based on the keyword
        # in the zone name. Customers don't care that "Teras Otella" is
        # technically a different label from "Outdoor"; they just want
        # to pick "indoor or outdoor".
        zones_summary: dict[str, dict] = {}
        for t in available:
            z = t["zone"] or "Main"
            if z not in zones_summary:
                z_lower = z.lower()
                category = "indoor"
                if any(k in z_lower for k in ("teras", "outdoor", "pool", "garden")):
                    category = "outdoor"
                zones_summary[z] = {
                    "zone": z,
                    "category": category,
                    "table_ids": [],
                    "count": 0,
                }
            zones_summary[z]["table_ids"].append(t["id"])
            zones_summary[z]["count"] += 1

        # Outdoor / indoor rollup so the LLM can answer "ada outdoor?"
        # without having to map zone names itself.
        categories: dict[str, list[str]] = {"indoor": [], "outdoor": []}
        for zs in zones_summary.values():
            categories[zs["category"]].extend(zs["table_ids"])

        return {
            "available": True,
            "tables": available,
            "count": len(available),
            "available_capacities": all_capacities,
            "zones": list(zones_summary.values()),
            "categories": {
                "indoor": {
                    "available": len(categories["indoor"]) > 0,
                    "count": len(categories["indoor"]),
                    "table_ids": categories["indoor"],
                },
                "outdoor": {
                    "available": len(categories["outdoor"]) > 0,
                    "count": len(categories["outdoor"]),
                    "table_ids": categories["outdoor"],
                },
            },
        }

    # Suggest alternative times if no availability
    suggestions = []
    for offset in [1, -1, 2, -2]:
        hour, minute = map(int, time.split(":"))
        alt_hour = hour + offset
        if 11 <= alt_hour <= 21:
            alt_time = f"{alt_hour:02d}:{minute:02d}"
            suggestions.append(alt_time)

    return {"available": False, "tables": [], "suggested_times": suggestions[:3]}


def _tool_create_booking(customer_id: str, date: str, time: str, pax: int,
                         table_id: str, guest_name: str, notes: str = "") -> dict:
    """Create a reservation in the database."""
    db = get_db()

    # Verify table exists and isn't currently occupied/cleaning.
    # Being already 'reserved' for a far-future booking is fine — the
    # reservation_policy below will reconcile once we insert this one.
    table = db.table("tables").select("*").eq("id", table_id).eq(
        "tenant_id", _tid()
    ).limit(1).execute()
    if not table.data:
        return {"success": False, "error": "Table not found"}
    table_row = table.data[0]
    if table_row.get("status") in ("occupied", "cleaning"):
        return {"success": False, "error": f"Table {table_id} is currently {table_row.get('status')}"}

    # Get customer phone for the booking
    customer = db.table("customers").select("phone").eq("id", customer_id).eq(
        "tenant_id", _tid()
    ).limit(1).execute()
    customer_phone = customer.data[0]["phone"] if customer.data else ""

    # `seating` is constrained by bookings_seating_check to one of
    # ('indoor','outdoor','window','private') (migration 008). The
    # tenant's actual zone label (e.g. "Teras Otella", "Poolside",
    # "Indoor Otella") would violate that CHECK and fail with 500.
    # Map zone keywords to the allowed values; the real zone name is
    # already preserved on the table_id reference.
    raw_zone = (table_row.get("zone") or "").lower()
    if any(k in raw_zone for k in ("teras", "pool", "outdoor", "garden")):
        seating = "outdoor"
    elif "window" in raw_zone:
        seating = "window"
    elif "private" in raw_zone or "vip" in raw_zone:
        seating = "private"
    else:
        seating = "indoor"

    result = db.table("bookings").insert({
        "tenant_id": _tid(),
        "customer_id": customer_id,
        "date": date,
        "time": time,
        "party_size": pax,
        "table_id": table_id,
        "guest_name": guest_name,
        "customer_phone": customer_phone,
        "notes": notes,
        "status": "reserved",
        "seating": seating,
    }).execute()

    # DB trigger flipped the table to 'reserved'. Revert to 'available'
    # if the booking is more than 3h away so walk-ins can use it.
    from app.services.reservation_policy import apply_booking_insert_policy
    apply_booking_insert_policy(db, result.data[0]["id"], table_id, date, time)

    return {
        "success": True,
        "booking_id": result.data[0]["id"],
        "table": table_id,
        "date": date,
        "time": time,
        "pax": pax,
        "guest_name": guest_name,
    }


def _tool_get_customer_profile(phone: str) -> dict:
    """Look up customer loyalty profile."""
    db = get_db()
    try:
        rows = db.table("customers").select(
            "name, phone, points, tier, total_visits, total_spent, is_member, tags"
        ).eq("tenant_id", _tid()).eq("phone", phone).execute()
    except Exception:
        return {"found": False}

    if not rows.data:
        return {"found": False}

    # Get available rewards they can redeem
    c = rows.data[0]
    rewards = db.table("rewards").select("name, points_cost, category").eq(
        "tenant_id", _tid()
    ).eq("is_active", True).lte("points_cost", c["points"]).execute().data

    return {
        "found": True,
        "name": c["name"],
        "tier": c["tier"],
        "points": c["points"],
        "total_visits": c["total_visits"],
        "total_spent": c["total_spent"],
        "is_member": c["is_member"],
        "redeemable_rewards": rewards,
    }


def _tool_get_menu(category: str = None) -> dict:
    """Get restaurant menu."""
    db = get_db()
    query = db.table("menu_items").select("name, price, category, description").eq(
        "tenant_id", _tid()
    ).eq("is_available", True)
    if category:
        query = query.eq("category", category)
    items = query.order("category").execute().data
    return {"items": items, "count": len(items)}


def _tool_escalate(conversation_id: str, reason: str) -> dict:
    """Escalate conversation to human agent."""
    db = get_db()
    db.table("conversations").update({
        "status": "active",  # Switch from bot to active (human agent)
    }).eq("id", conversation_id).eq("tenant_id", _tid()).execute()
    return {"escalated": True, "reason": reason}


def _tool_list_customer_bookings(customer_id: str) -> dict:
    """List this customer's upcoming + recent bookings so the bot can
    answer 'cancel/reschedule/check my booking' requests without guessing."""
    if not customer_id:
        return {"bookings": [], "count": 0, "error": "Missing customer_id"}
    db = get_db()
    today = datetime.now().strftime("%Y-%m-%d")
    cutoff = (datetime.now() + timedelta(days=14)).strftime("%Y-%m-%d")
    try:
        rows = db.table("bookings").select(
            "id, date, time, party_size, table_id, guest_name, seating, status, notes"
        ).eq("tenant_id", _tid()).eq("customer_id", customer_id).gte(
            "date", today
        ).lte("date", cutoff).order("date").order("time").execute().data or []
        # Only surface bookings that are still actionable.
        actionable = [
            r for r in rows if r.get("status") in ("reserved", "occupied")
        ]
        return {"bookings": actionable, "count": len(actionable)}
    except Exception as e:
        return {"bookings": [], "count": 0, "error": str(e)}


def _tool_cancel_booking(customer_id: str, booking_id: str) -> dict:
    """Cancel a booking. Verifies ownership (customer_id match) before cancelling.
    The DB trigger frees the table automatically."""
    if not booking_id:
        return {"success": False, "error": "Missing booking_id"}
    db = get_db()
    try:
        existing = db.table("bookings").select(
            "id, customer_id, status, date, time, table_id"
        ).eq("id", booking_id).eq("tenant_id", _tid()).execute().data
        if not existing:
            return {"success": False, "error": "Booking not found"}
        row = existing[0]
        if customer_id and row.get("customer_id") != customer_id:
            return {"success": False, "error": "Booking belongs to another customer"}
        if row.get("status") not in ("reserved", "occupied"):
            return {
                "success": False,
                "error": f"Cannot cancel booking in status '{row.get('status')}'",
            }
        db.table("bookings").update({"status": "cancelled"}).eq(
            "id", booking_id
        ).eq("tenant_id", _tid()).execute()
        return {
            "success": True,
            "booking_id": booking_id,
            "date": row.get("date"),
            "time": row.get("time"),
            "table_id": row.get("table_id"),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def _tool_modify_booking(
    customer_id: str,
    booking_id: str,
    party_size: int | None = None,
    table_id: str | None = None,
    time: str | None = None,
    date: str | None = None,
    notes: str | None = None,
) -> dict:
    """Update an existing booking in place. The bot calls this when the
    customer wants to add/remove people, change time/date, swap tables,
    or update notes — instead of cancel+create which loses history and
    can race with reminders.

    Validation:
      • Booking must exist, belong to the customer, and be in
        reserved/occupied state.
      • If party_size grows beyond the current (or new) table's
        capacity, refuse with the table's actual capacity so the LLM
        can ask the customer to pick a bigger table or split.
      • If the new table is already booked at that date+time by
        someone else, refuse with the conflicting booking_id.
    """
    if not booking_id:
        return {"success": False, "error": "Missing booking_id"}
    db = get_db()
    try:
        existing = db.table("bookings").select(
            "id, customer_id, status, date, time, table_id, party_size, notes, seating"
        ).eq("id", booking_id).eq("tenant_id", _tid()).execute().data
        if not existing:
            return {"success": False, "error": "Booking not found"}
        row = existing[0]
        if customer_id and row.get("customer_id") != customer_id:
            return {"success": False, "error": "Booking belongs to another customer"}
        if row.get("status") not in ("reserved", "occupied"):
            return {
                "success": False,
                "error": f"Cannot modify booking in status '{row.get('status')}'",
            }

        new_pax = int(party_size) if party_size is not None else row["party_size"]
        new_date = date or row["date"]
        new_time = time or row["time"]
        new_table_id = table_id or row["table_id"]

        # Capacity / conflict check on the target table.
        if new_table_id:
            tbl = db.table("tables").select("id, capacity, zone").eq(
                "tenant_id", _tid()
            ).eq("id", new_table_id).execute().data
            if not tbl:
                return {"success": False, "error": f"Table {new_table_id} not found"}
            if new_pax > tbl[0]["capacity"]:
                return {
                    "success": False,
                    "error": (
                        f"Table {new_table_id} only fits {tbl[0]['capacity']} pax, "
                        f"but party_size is {new_pax}. Pick a bigger table_id."
                    ),
                    "current_table_capacity": tbl[0]["capacity"],
                }
            if new_table_id != row["table_id"] or new_date != row["date"] or new_time != row["time"]:
                conflict = db.table("bookings").select("id, customer_id").eq(
                    "tenant_id", _tid()
                ).eq("date", new_date).eq("time", new_time).eq(
                    "table_id", new_table_id,
                ).neq("id", booking_id).in_(
                    "status", ["reserved", "occupied"],
                ).execute().data or []
                if conflict:
                    return {
                        "success": False,
                        "error": (
                            f"Table {new_table_id} is already booked at {new_date} "
                            f"{new_time}. Pick a different table or time."
                        ),
                        "conflicting_booking_id": conflict[0]["id"],
                    }

        # Build the patch — only include fields the caller actually wanted to change.
        patch: dict = {}
        if party_size is not None:
            patch["party_size"] = new_pax
        if table_id is not None:
            patch["table_id"] = new_table_id
            # Re-derive seating from the new table's zone (same mapping the
            # create path uses). Keeps bookings_seating_check happy.
            zone = (tbl[0].get("zone") or "").lower()
            if any(k in zone for k in ("teras", "pool", "outdoor", "garden")):
                patch["seating"] = "outdoor"
            elif "window" in zone:
                patch["seating"] = "window"
            elif "private" in zone or "vip" in zone:
                patch["seating"] = "private"
            else:
                patch["seating"] = "indoor"
        if time is not None:
            patch["time"] = new_time
        if date is not None:
            patch["date"] = new_date
        if notes is not None:
            patch["notes"] = notes

        if not patch:
            return {"success": False, "error": "No fields to update"}

        # If the table changed, free the old table reservation hold.
        old_table_id = row.get("table_id")
        if table_id is not None and old_table_id and old_table_id != new_table_id:
            try:
                db.table("tables").update({
                    "status": "available",
                    "current_booking_id": None,
                }).eq("id", old_table_id).eq(
                    "tenant_id", _tid()
                ).eq("current_booking_id", booking_id).execute()
            except Exception:
                # Best-effort — reconcile job will fix any drift.
                pass

        db.table("bookings").update(patch).eq("id", booking_id).eq(
            "tenant_id", _tid()
        ).execute()

        # Re-apply the reservation policy so the new table flips to
        # 'reserved' if the booking is within the 3-hour window.
        try:
            from app.services.reservation_policy import apply_booking_insert_policy
            apply_booking_insert_policy(db, booking_id, new_table_id, new_date, new_time)
        except Exception:
            pass

        return {
            "success": True,
            "booking_id": booking_id,
            "date": new_date,
            "time": new_time,
            "party_size": new_pax,
            "table_id": new_table_id,
            "notes": patch.get("notes", row.get("notes")),
            "changed_fields": list(patch.keys()),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


TOOL_HANDLERS = {
    "get_availability": lambda args: _tool_get_availability(args["date"], args["time"], args["pax"]),
    "get_customer_profile": lambda args: _tool_get_customer_profile(args["phone"]),
    "get_menu": lambda args: _tool_get_menu(args.get("category")),
}


# Words the AI sometimes mistakes for a customer name. These are common
# confirmation/refusal/pronoun tokens in Indonesian + English chat. If the
# AI passes any of these to `update_customer_name`, the tool refuses
# silently — better to ask again than save "Betul" as the customer's name.
_NOT_A_NAME = {
    # Confirmation / agreement
    "betul", "ya", "iya", "yes", "ok", "oke", "okay", "okey", "sip", "sippp",
    "deal", "gas", "gaspol", "kuy", "yuk", "boleh", "bisa", "sabi", "setuju",
    "benar", "tepat", "fix", "fiks", "fixed", "siap", "yoi", "noted",
    # Refusal / negation
    "tidak", "nggak", "ga", "gak", "enggak", "no", "nope", "jangan",
    "batal", "cancel", "skip", "ngga", "engga", "bukan",
    # Pronouns
    "saya", "aku", "gue", "gw", "kamu", "lo", "lu", "ane", "anda", "dia", "kita",
    # Generic / placeholders
    "test", "testing", "coba", "asd", "dummy", "sample",
    # Greetings
    "halo", "hai", "hi", "hei", "selamat", "pagi", "siang", "sore", "malam",
    # Common requests / nouns the AI might mis-extract
    "menu", "booking", "reservasi", "meja", "pesan", "harga", "promo",
    "member", "loyalty", "poin", "point", "reward", "info", "tanya",
    # Politeness
    "terima", "kasih", "makasih", "thanks", "thank", "thx", "tolong",
    "maaf", "permisi", "kak", "mbak", "mas", "pak", "bu", "bro", "sis",
    # Single-word confirmations of detail
    "sendiri", "saja", "aja", "doang",
}


def _is_likely_name(name: str) -> bool:
    """Reject obvious non-names so the bot doesn't save 'Betul' or 'Saya'
    as a customer's display name. Returns True only when the string looks
    plausibly like a real human name."""
    n = name.strip()
    if len(n) < 2 or len(n) > 50:
        return False
    # Reject anything that contains digits or symbols beyond standard name chars
    if any(c.isdigit() for c in n):
        return False
    # Reject if any word is in the not-a-name list
    words = [w.lower().strip(".,!?;:") for w in n.split()]
    if any(w in _NOT_A_NAME for w in words):
        return False
    # Reject if entirely lowercase short single word — usually a confirmation
    # or pronoun (e.g. "betul", "saya"). Real names typed by humans almost
    # always start with an uppercase letter.
    if len(words) == 1 and n.islower():
        return False
    return True


def _tool_update_customer_name(customer_id: str, name: str) -> dict:
    """Save customer name to database. Refuses obvious non-names (confirmation
    words, pronouns, greetings) so the AI can't accidentally rename a
    customer to 'Betul' or 'Saya'."""
    if not customer_id or not name:
        return {"success": False, "error": "Missing customer_id or name"}
    if not _is_likely_name(name):
        return {
            "success": False,
            "error": (
                f"'{name}' tidak terlihat seperti nama orang — kemungkinan kata "
                "konfirmasi/pronouns/greeting. Tanyakan nama customer dengan "
                "lebih jelas terlebih dahulu sebelum memanggil tool ini lagi."
            ),
        }
    clean_name = " ".join(w.capitalize() for w in name.strip().split())
    try:
        db = get_db()
        db.table("customers").update({"name": clean_name}).eq(
            "id", customer_id
        ).eq("tenant_id", _tid()).execute()
        return {"success": True, "name": clean_name}
    except Exception as e:
        return {"success": False, "error": str(e)}


def _execute_tool(name: str, args: dict, context: dict = None) -> str:
    """Execute a tool and return the result as JSON string."""
    cust_id = context.get("customer_id", "") if context else ""
    if name == "create_booking":
        result = _tool_create_booking(**args)
    elif name == "escalate_to_human":
        conv_id = context.get("conversation_id", "") if context else ""
        result = _tool_escalate(conv_id, args["reason"])
    elif name == "update_customer_name":
        result = _tool_update_customer_name(cust_id, args.get("name", ""))
    elif name == "list_customer_bookings":
        result = _tool_list_customer_bookings(cust_id)
    elif name == "cancel_booking":
        result = _tool_cancel_booking(cust_id, args.get("booking_id", ""))
    elif name == "modify_booking":
        result = _tool_modify_booking(
            customer_id=cust_id,
            booking_id=args.get("booking_id", ""),
            party_size=args.get("party_size"),
            table_id=args.get("table_id"),
            time=args.get("time"),
            date=args.get("date"),
            notes=args.get("notes"),
        )
    elif name in TOOL_HANDLERS:
        result = TOOL_HANDLERS[name](args)
    else:
        result = {"error": f"Unknown tool: {name}"}
    return json.dumps(result)


async def generate_reply(customer_phone: str, message: str,
                         context: list[dict] = None,
                         conversation_id: str = "",
                         customer_name: str = None,
                         is_first_message: bool = False) -> str:
    """Generate a bot reply using OpenAI GPT-4o-mini with function calling."""
    if not OPENAI_API_KEY:
        return _fallback_reply(message, customer_name=customer_name, is_first_message=is_first_message, customer_phone=customer_phone)

    # Fetch customer info + build context
    db = get_db()
    customer_context = ""
    customer_id = ""
    try:
        cust_rows = db.table("customers").select(
            "id, name, points, tier, total_visits, is_member"
        ).eq("tenant_id", _tid()).eq("phone", customer_phone).execute()
        if cust_rows.data:
            c = cust_rows.data[0]
            customer_id = c["id"]
            needs_name = c['name'] == c.get('phone', '') or c['name'].startswith('+')
            today = datetime.now().strftime("%Y-%m-%d")
            tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
            customer_context = (
                f"\n\n[TODAY: {today}, TOMORROW: {tomorrow}]\n"
                f"[Customer: {c['name']}, Tier: {c['tier']}, "
                f"Points: {c['points']}, Visits: {c['total_visits']}, "
                f"Member: {c['is_member']}, ID: {customer_id}, "
                f"Phone: {customer_phone}, NEEDS_NAME: {needs_name}]"
            )
    except Exception:
        pass

    # Fetch restaurant settings + table info
    settings = _get_restaurant_settings()
    table_info = ""
    try:
        tables = db.table("tables").select("id, capacity, zone, status").eq(
            "tenant_id", _tid()
        ).order("id").execute().data
        if tables:
            table_lines = []
            for t in tables:
                table_lines.append(f"  - Meja {t['id']}: {t['capacity']} orang, area {t['zone']}, status: {t['status']}")
            table_info = (
                f"DAFTAR MEJA ({len(tables)} meja total):\n"
                + "\n".join(table_lines)
                + f"\nKapasitas tersedia: {', '.join(sorted(set(str(t['capacity']) for t in tables)))} orang per meja."
                + f"\nKapasitas terbesar: {max(t['capacity'] for t in tables)} orang."
                + f"\n\nMINIMUM CHARGE:"
                + f"\n- Private Room (Meja C1, C2): Minimum charge Rp 250.000 per meja."
                + f"\n- Area lainnya (Indoor, Outdoor, Window): Tidak ada minimum charge."
            )
    except Exception:
        pass

    hrs = operating_hours(settings)
    settings_context = (
        f"\n\nINFORMASI RESTORAN (gunakan untuk menjawab pertanyaan):\n"
        f"Nama: {settings.get('name', 'Restoran')}\n"
        f"Jam buka: {settings.get('days_open', 'Setiap hari')} {hrs['hours_str']}\n"
        f"Last order: {hrs['last_order_str']} (otomatis = tutup − 30 menit)\n"
        f"Reservasi terakhir: {hrs['last_booking_str']} (otomatis = tutup − 1 jam)\n"
        f"Lokasi: {settings.get('location', '')}\n"
        f"Instagram: {settings.get('instagram', '')}\n"
        f"Telepon: {settings.get('phone', '')}\n"
        f"Promo saat ini: {settings.get('promo_text', 'Belum ada promo')}\n"
        f"\n{table_info}\n"
    )

    biz_name = settings.get("name") or "Restoran"
    system_prompt = _build_system_prompt(biz_name) + settings_context + customer_context

    # Build OpenAI messages — last 14 messages of history. The bot used
    # to forget facts the customer stated 4-5 turns ago (e.g. "jam 7
    # malam" said early in the booking flow, then asked again later)
    # because the 6-message window dropped them. 14 is enough to hold
    # the typical booking arc (greeting → date/time → pax → area →
    # notes → confirm → 1-2 follow-ups) without ballooning prompt cost.
    messages = [{"role": "system", "content": system_prompt}]
    if context:
        for msg in context[-14:]:
            role = "user" if msg["sender"] == "customer" else "assistant"
            messages.append({"role": role, "content": msg["content"]})

    # Ensure last message is the current user message
    if not messages or messages[-1]["role"] != "user":
        messages.append({"role": "user", "content": message})
    else:
        messages[-1]["content"] = message

    try:
        import openai
        client = openai.OpenAI(api_key=OPENAI_API_KEY)

        # Tool calling loop (max 4 rounds)
        for rounds in range(4):
            response = client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=messages,
                tools=_get_openai_tools(),
                max_tokens=600,
                temperature=0.7,
            )

            msg = response.choices[0].message

            # If no tool calls, return the text response
            if not msg.tool_calls:
                return _strip_markdown(msg.content) or "Maaf Kak, coba lagi ya 🙏"

            # Process tool calls
            messages.append({
                "role": "assistant",
                "content": msg.content,
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        },
                    }
                    for tc in msg.tool_calls
                ],
            })

            for tc in msg.tool_calls:
                args = json.loads(tc.function.arguments)
                # Log every tool invocation so we can verify in HF logs
                # whether the LLM actually called the right tool. Critical
                # for debugging the "bot claimed success without tool call"
                # failure mode reported during modify_booking testing.
                args_summary = ", ".join(
                    f"{k}={v!r}"
                    for k, v in args.items()
                    if k not in ("customer_id",)
                )[:200]
                print(
                    f"[bot-tool] {tc.function.name}({args_summary})",
                    flush=True,
                )
                result = _execute_tool(
                    tc.function.name,
                    args,
                    {"conversation_id": conversation_id, "customer_id": customer_id},
                )
                # Log a short preview of the result so success/failure is
                # visible without dumping the whole row.
                preview = result if len(result) <= 200 else result[:200] + "…"
                print(f"[bot-tool] → {preview}", flush=True)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result,
                })

        return "Maaf Kak, ada gangguan teknis. Coba lagi ya 🙏"
    except Exception as e:
        # Full traceback so we can root-cause why the LLM path bailed.
        # Without this we just see the symptom (generic-menu fallback).
        print(f"[OpenAI] Exception: {e}\n{traceback.format_exc()}")
        return _fallback_reply(
            message,
            customer_name=customer_name,
            is_first_message=is_first_message,
            customer_phone=customer_phone,
            history=context,
        )


def _get_restaurant_settings():
    """Fetch restaurant settings for the current tenant."""
    from app.db import get_db
    try:
        db = get_db()
        result = db.table("restaurant_settings").select("*").eq(
            "tenant_id", _tid()
        ).limit(1).execute()
        if result.data:
            return result.data[0]
    except Exception:
        pass
    # Fallback defaults if no row exists for this tenant.
    return {
        "name": "Restoran",
        "opening_hours": "11:00 - 22:00",
        "last_order": "21:30",
        "days_open": "Setiap hari",
        "location": "",
        "promo_text": "",
        "welcome_message": "Halo! Selamat datang 👋",
    }


def _fallback_reply(message: str, customer_name: str = None, is_first_message: bool = False,
                     customer_phone: str = None, history: list[dict] | None = None) -> str:
    """Keyword-based fallback — all responses pulled from database."""
    from app.db import get_db
    msg = message.lower()
    settings = _get_restaurant_settings()
    resto_name = settings.get("name", "Restoran")

    # Helper: name prefix
    has_name = customer_name and not customer_name.startswith("+")
    kak = f"Kak {customer_name}" if has_name else "Kak"

    # --- CONFIRMATION ("mantap" / "sip" / "iya benar" / "oke deh") ---
    # When the LLM bails mid-flow on a booking confirmation, we used to
    # send a placebo "lagi diproses" reply that lied — no booking was
    # ever created. Now we parse the bot's prior confirmation message
    # (Tanggal/Jam/Pax/Area/Meja) and create the booking deterministically
    # through _tool_create_booking, matching what the LLM was about to do.
    if _is_confirmation(message):
        last_bot_raw = ""
        if history:
            for h in reversed(history):
                if h.get("sender") in ("bot", "assistant"):
                    last_bot_raw = h.get("content") or ""
                    break
        last_bot = last_bot_raw.lower()
        looks_like_confirm_prompt = any(
            k in last_bot
            for k in ("setuju", "benar", "konfirmasi", "apakah", "tanggal", "meja")
        )
        if looks_like_confirm_prompt and customer_phone:
            booking = _try_create_booking_from_history(last_bot_raw, customer_phone)
            if booking.get("ok"):
                area_line = (
                    f"\n- Area: {booking['area']}" if booking.get("area") else ""
                )
                return _strip_markdown(
                    f"Done {kak}! Reservasi sudah dibuat ✅\n"
                    f"- Tanggal: {booking['date']}\n"
                    f"- Jam: {booking['time']}\n"
                    f"- Meja: {booking['table_id']}\n"
                    f"- Jumlah Orang: {booking['pax']}"
                    f"{area_line}\n\n"
                    f"Sampai ketemu nanti ya 😊"
                )
            # Honest error — don't pretend it worked
            return _strip_markdown(
                f"Maaf {kak}, ada gangguan kecil pas mau buat reservasinya 🙏 "
                f"Bisa coba ketik ulang detailnya? (tanggal, jam, jumlah orang, area)"
            )
        return _strip_markdown(
            f"Sip {kak}! 😊 Ada yang lain yang bisa dibantu? Mau booking, lihat menu, atau cek poin?"
        )

    # Check if this message looks like a name response (very strict)
    words = message.strip().split()
    is_name_response = (
        len(words) <= 2
        and len(words) >= 1
        and all(w.isalpha() for w in words)
        and len(message.strip()) >= 2
        and len(message.strip()) <= 25
        and message.strip()[0].isupper()
        and not any(w.lower() in {"booking", "menu", "harga", "poin", "promo", "halo", "hi", "hai",
                                    "oke", "ya", "tidak", "boleh", "mau", "saya", "ada", "apa",
                                    "reservasi", "bisa", "tolong", "info", "cek", "yaa", "mantap"
                                    } for w in words)
    )

    if is_name_response and has_name:
        return (
            f"Hai {kak}! Salam kenal 😊\n"
            f"Ada yang bisa dibantu?\n"
            f"- Booking meja\n"
            f"- Info menu & harga\n"
            f"- Cek loyalty points\n"
            f"- Info promo"
        )

    # --- BOOKING ---
    if any(w in msg for w in ["booking", "reservasi", "book", "pesan meja", "mau makan"]):
        prefix = f"Hai {kak}! " if has_name else ""
        db = get_db()
        try:
            tables = db.table("tables").select("id, capacity, zone, status").eq(
                "tenant_id", _tid()
            ).eq("status", "available").execute().data
            table_info = f"\n\nMeja tersedia: {len(tables)} meja" if tables else "\n\n⚠️ Semua meja sedang penuh saat ini."
        except Exception:
            table_info = ""
        return (
            f"{prefix}Mau booking meja ya? 😊\n"
            f"Boleh info:\n"
            f"1. Tanggal berapa?\n"
            f"2. Jam berapa?\n"
            f"3. Untuk berapa orang?\n"
            f"4. Ada request khusus?{table_info}"
        )

    # --- MENU ---
    elif any(w in msg for w in ["menu", "makan", "harga", "price", "makanan", "minuman"]):
        db = get_db()
        try:
            items = db.table("menu_items").select("name, price, category").eq(
                "tenant_id", _tid()
            ).eq("is_available", True).order("category").execute().data

            categories: dict[str, list] = {}
            for item in items:
                cat = item["category"]
                if cat not in categories:
                    categories[cat] = []
                categories[cat].append(item)

            cat_emoji = {"Brunch": "🥞", "Lite Bites": "🍗", "Main": "🍛", "Dessert": "🍰", "Beverage": "☕"}
            lines = [f"Menu {resto_name} 🍽️\n"]
            for cat, cat_items in categories.items():
                emoji = cat_emoji.get(cat, "•")
                lines.append(f"{emoji} *{cat}*")
                for item in cat_items[:4]:
                    price_k = item["price"] // 1000
                    lines.append(f"  - {item['name']} — Rp {price_k}K")
                if len(cat_items) > 4:
                    lines.append(f"  ... dan {len(cat_items) - 4} lainnya")
                lines.append("")
            lines.append("Mau order yang mana? 😋")
            return "\n".join(lines)
        except Exception:
            return f"Menu {resto_name} lagi di-update kak, coba lagi nanti ya 🙏"

    # --- LOYALTY / POINTS ---
    elif any(w in msg for w in ["point", "poin", "loyalty", "reward", "member"]):
        db = get_db()
        try:
            rewards = db.table("rewards").select("name, points_cost").eq(
                "tenant_id", _tid()
            ).eq("is_active", True).order("points_cost").execute().data

            reward_lines = "\n".join(
                f"⭐ {r['points_cost']} pts — {r['name']}" for r in rewards
            )

            member_info = ""
            if customer_phone:
                cust = db.table("customers").select("points, tier, is_member").eq(
                    "tenant_id", _tid()
                ).eq("phone", customer_phone).execute()
                if cust.data and cust.data[0].get("is_member"):
                    c = cust.data[0]
                    tier = c.get("tier") or "Bronze"
                    member_info = f"\n\n{kak} — {tier} | {c['points']} pts 🎖️"
                else:
                    member_info = f"\n\n{kak} belum jadi member. Yuk daftar biar bisa kumpulin poin! 🎉"

            return f"Rewards yang tersedia:\n{reward_lines}{member_info}"
        except Exception:
            return "Info loyalty lagi di-update kak, coba lagi nanti ya 🙏"

    # --- COMPLAINT ---
    elif any(w in msg for w in ["complain", "kecewa", "jelek", "lama", "mahal", "buruk", "parah"]):
        return (
            f"Mohon maaf atas ketidaknyamanannya {kak} 🙏\n"
            f"Feedback kamu sangat berarti buat {resto_name}.\n"
            f"Akan saya sampaikan ke manager langsung. Tim kami akan segera menghubungi kakak."
        )

    # --- HOURS ---
    elif any(w in msg for w in ["jam", "buka", "tutup", "waktu", "operasional", "open"]):
        hrs = operating_hours(settings)
        days = settings.get("days_open", "Setiap hari")
        location = settings.get("location", "")
        loc_text = f"\n📍 {location}" if location else ""
        return (
            f"{resto_name} buka {days} jam {hrs['hours_str']} ya 🕐\n"
            f"Last order jam {hrs['last_order_str']}, reservasi terakhir bisa "
            f"untuk jam {hrs['last_booking_str']} (1 jam sebelum tutup).{loc_text}"
        )

    # --- PROMO ---
    elif any(w in msg for w in ["promo", "diskon", "discount", "special"]):
        promo = settings.get("promo_text", "")
        if promo:
            return f"Promo {resto_name} yang lagi jalan:\n\n{promo}"

        # If no promo in settings, check campaigns
        db = get_db()
        try:
            campaigns = db.table("campaigns").select("name, message").eq(
                "tenant_id", _tid()
            ).eq("status", "sent").order("sent_at", desc=True).limit(3).execute().data
            if campaigns:
                lines = [f"Promo {resto_name} yang lagi jalan:\n"]
                for c in campaigns:
                    lines.append(f"🔥 {c['name']}")
                return "\n".join(lines)
        except Exception:
            pass
        return f"Belum ada promo khusus saat ini {kak}. Stay tuned ya! 😊"

    # --- LOCATION ---
    elif any(w in msg for w in ["lokasi", "alamat", "dimana", "where", "address", "maps"]):
        location = settings.get("location", "")
        ig = settings.get("instagram", "")
        if location:
            text = f"📍 {resto_name} ada di {location}"
            if ig:
                text += f"\n📱 IG: {ig}"
            return text
        return f"Info lokasi {resto_name} bisa cek Instagram kita ya {kak}! 😊"

    # --- DEFAULT ---
    else:
        welcome = settings.get("welcome_message", f"Halo! Selamat datang di {resto_name} 👋")
        ask_name = ""
        if is_first_message or (customer_name and customer_name.startswith("+")):
            ask_name = "\n\nBtw boleh tau nama kakaknya siapa? 😊"
        elif has_name:
            welcome = f"Hai {kak}! 👋"
        return (
            f"{welcome}\n"
            f"Ada yang bisa dibantu?\n"
            f"- Booking meja\n"
            f"- Info menu & harga\n"
            f"- Cek loyalty points\n"
            f"- Info promo{ask_name}"
        )


def _try_update_name(db, customer_id: str, text: str, phone: str):
    """Extract customer name ONLY from explicit name statements.

    Only updates name when the message clearly contains a name declaration.
    Does NOT try to guess names from short messages.
    """
    import re
    msg = text.strip()

    # Only match explicit "nama saya X" or "atas nama X" patterns
    patterns = [
        r"(?:nama\s*(?:saya|gue|gw|ku|aku)\s+)(.+)",
        r"(?:atas\s*nama\s+)(.+)",
        r"(?:panggil\s*(?:saya|aku|gue)\s+)(.+)",
        r"(?:my name is\s+)(.+)",
        r"(?:this is\s+)(.+)",
        r"(?:i'?m\s+)(.+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, msg, re.IGNORECASE)
        if match:
            name = match.group(1).strip().rstrip(".!?,")
            if 2 <= len(name) <= 30 and not name.startswith("+"):
                name = " ".join(w.capitalize() for w in name.split())
                db.table("customers").update({"name": name}).eq(
                    "id", customer_id
                ).eq("tenant_id", _tid()).execute()
                return

    # Only accept as name if: exactly 1-2 words, all alpha, no common words
    # AND the message is ONLY a name (nothing else)
    not_names = {
        "halo", "hai", "hi", "hey", "hello", "yo", "oi", "bro", "sis",
        "kak", "bang", "mas", "mba", "mbak", "gan", "min", "admin",
        "pagi", "siang", "sore", "malam", "mau", "minta", "tolong",
        "iya", "ya", "ok", "oke", "sip", "gas", "yuk", "kuy", "boleh",
        "menu", "booking", "book", "pesan", "harga", "promo", "reservasi",
        "tidak", "nggak", "gak", "enggak", "jangan", "batal", "cancel",
        "okay", "baik", "benar", "betul", "setuju", "deal",
        "terima", "kasih", "makasih", "thanks", "thank", "thx",
        "bisa", "sabi", "dong", "deh", "nih", "tuh", "lah", "sih",
        "cek", "lihat", "liat", "tanya", "info", "ada", "apa", "yang",
        "untuk", "dari", "dengan", "di", "ke", "ini", "itu", "juga",
        "meja", "orang", "jam", "tanggal", "besok", "lusa", "nanti",
        "apakah", "bagaimana", "gimana", "kapan", "dimana", "siapa",
        "yaa", "yah", "dong", "sih", "nih", "deh", "loh", "kan",
        "minimum", "charge", "biaya", "bayar", "mahal", "murah",
    }
    words = msg.split()
    if (
        len(words) <= 2
        and len(words) >= 1
        and all(w.isalpha() for w in words)
        and len(msg) >= 2
        and len(msg) <= 25
        and not any(w.lower() in not_names for w in words)
        # Must start with uppercase (looks like a proper name)
        and msg[0].isupper()
    ):
        name = " ".join(w.capitalize() for w in words)
        db.table("customers").update({"name": name}).eq(
            "id", customer_id
        ).eq("tenant_id", _tid()).execute()


async def handle_incoming_message(
    phone: str,
    text: str,
    platform: str = "whatsapp",
    tenant_id: str | None = None,
):
    """Process an incoming message from any channel: save, generate reply, send.

    Args:
        phone: Sender phone number or platform-specific ID
        text: Message text content
        platform: Source platform (whatsapp, instagram, tiktok)
        tenant_id: Tenant that owns the receiving WABA. Resolved upstream by
                   the webhook router from `phone_number_id`. When None we
                   fall back to the default seed tenant so legacy
                   single-tenant deployments and dev keep working.
    """
    # Stash tenant context for every helper / tool / fallback that runs
    # downstream — they read it via `_tid()` and scope DB queries.
    resolved_tid = tenant_id or _FALLBACK_TENANT
    _tenant_ctx.set(resolved_tid)

    db = get_db()

    # Find or create customer — phone is unique per (tenant_id, phone)
    # post-migration 027, so two tenants can each have a record for the
    # same phone without colliding.
    from postgrest.exceptions import APIError

    customer_id = None
    is_new_customer = False
    customer_name = None
    try:
        existing = db.table("customers").select("id, name, phone").eq(
            "tenant_id", resolved_tid
        ).eq("phone", phone).execute()
        if existing.data:
            customer_id = existing.data[0]["id"]
            customer_name = existing.data[0]["name"]
    except APIError:
        pass

    if not customer_id:
        is_new_customer = True
        result = db.table("customers").insert({
            "tenant_id": resolved_tid,
            "phone": phone,
            "name": phone,  # Will be updated when they tell us their name
            "points": 0,
            "total_visits": 0,
            "total_spent": 0,
            "is_member": False,
            "tags": [platform],
        }).execute()
        customer_id = result.data[0]["id"]
        customer_name = phone

    # Check if customer name is still just a phone number (needs name)
    needs_name = customer_name == phone if customer_name else True

    # Find or create conversation
    conv_data = None
    try:
        conv_result = db.table("conversations").select("id, unread_count").eq(
            "tenant_id", resolved_tid
        ).eq("customer_id", customer_id).execute()
        if conv_result.data:
            conv_data = conv_result.data[0]
    except APIError:
        pass

    if not conv_data:
        conv_insert = db.table("conversations").insert({
            "tenant_id": resolved_tid,
            "customer_id": customer_id,
            "last_message": text,
            "last_message_time": "now()",
            "unread_count": 1,
            "status": "bot",
        }).execute()
        conv_id = conv_insert.data[0]["id"]
    else:
        conv_id = conv_data["id"]
        db.table("conversations").update({
            "last_message": text,
            "last_message_time": "now()",
            "unread_count": conv_data["unread_count"] + 1,
            "status": "bot",
        }).eq("id", conv_id).eq("tenant_id", resolved_tid).execute()

    # Save incoming message
    db.table("messages").insert({
        "tenant_id": resolved_tid,
        "conversation_id": conv_id,
        "customer_id": customer_id,
        "content": text,
        "sender": "customer",
        "read": False,
    }).execute()

    # Name detection is now handled by the update_customer_name tool (via GPT)

    # Get conversation context (last 20 messages)
    history = db.table("messages").select("content, sender").eq(
        "tenant_id", resolved_tid
    ).eq("conversation_id", conv_id).order("timestamp").limit(20).execute().data

    # Generate bot reply with tool calling
    reply = await generate_reply(
        phone, text, history,
        conversation_id=conv_id,
        customer_name=customer_name,
        is_first_message=is_new_customer,
    )
    # Belt-and-suspenders: strip any markdown that slipped through (the
    # LLM occasionally ignores the prompt rule and inserts **bold** or
    # leading "# " headings even though we forbid them).
    reply = _strip_markdown(reply)

    # Safety net: if customer still has no real name and the model forgot to ask,
    # append the name question so we never miss it.
    if needs_name and reply:
        reply_lower = reply.lower()
        asks_for_name = (
            "nama" in reply_lower
            or "panggil" in reply_lower
            or "atas nama" in reply_lower
        )
        if not asks_for_name:
            reply = reply.rstrip() + "\n\nOh iya, boleh tahu nama Kakak biar obrolannya lebih enak? 😊"

    # Save bot reply
    db.table("messages").insert({
        "tenant_id": resolved_tid,
        "conversation_id": conv_id,
        "customer_id": customer_id,
        "content": reply,
        "sender": "bot",
        "read": True,
    }).execute()

    # Update conversation
    db.table("conversations").update({
        "last_message": reply,
        "last_message_time": "now()",
    }).eq("id", conv_id).eq("tenant_id", resolved_tid).execute()

    # Send reply via WhatsApp (other platforms handled by their own send functions)
    if platform == "whatsapp":
        await send_message(phone, reply, tenant_id=resolved_tid)

    return reply
