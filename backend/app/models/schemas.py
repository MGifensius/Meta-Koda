from datetime import datetime, date, time
from pydantic import BaseModel, EmailStr
from typing import Optional
from enum import Enum


# --- Customers ---
class CustomerTier(str, Enum):
    bronze = "Bronze"
    silver = "Silver"
    gold = "Gold"
    diamond = "Diamond"


class CustomerCreate(BaseModel):
    name: str
    phone: str
    email: Optional[str] = None
    tags: list[str] = []
    is_member: bool = False


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    tags: Optional[list[str]] = None


class CustomerResponse(BaseModel):
    id: str
    name: str
    phone: str
    email: Optional[str]
    points: int
    total_visits: int
    total_spent: int
    tier: CustomerTier
    joined_at: str
    last_visit: Optional[str]
    tags: list[str]
    is_member: bool = False


# --- Bookings ---
class BookingStatus(str, Enum):
    reserved = "reserved"
    occupied = "occupied"
    done = "done"
    cancelled = "cancelled"
    no_show = "no_show"


class BookingCreate(BaseModel):
    customer_id: str
    date: str
    time: str
    party_size: int
    table_id: str
    seating: str
    guest_name: str
    customer_phone: str
    notes: Optional[str] = ""


class TableStatus(str, Enum):
    available = "available"
    reserved = "reserved"
    occupied = "occupied"
    cleaning = "cleaning"


class BookingUpdate(BaseModel):
    status: Optional[BookingStatus] = None
    date: Optional[str] = None
    time: Optional[str] = None
    party_size: Optional[int] = None
    table_id: Optional[str] = None
    notes: Optional[str] = None


class BookingResponse(BaseModel):
    id: str
    customer_id: str
    customer_name: str
    date: str
    time: str
    party_size: int
    status: BookingStatus
    table_id: str
    notes: Optional[str]
    created_at: str


# --- Marketing ---
class CampaignStatus(str, Enum):
    draft = "draft"
    scheduled = "scheduled"
    sent = "sent"
    failed = "failed"


class CampaignCreate(BaseModel):
    name: str
    message: str
    audience: str
    target_audience: str = "all"
    scheduled_at: Optional[str] = None
    template_name: Optional[str] = None
    template_language: str = "en_US"
    template_params: list[str] = []


class CampaignResponse(BaseModel):
    id: str
    name: str
    message: str
    audience: str
    audience_count: int
    status: CampaignStatus
    scheduled_at: Optional[str]
    sent_at: Optional[str]
    delivered: int
    read: int


# --- Loyalty ---
class RewardCategory(str, Enum):
    discount = "discount"
    freebie = "freebie"
    experience = "experience"


class RewardCreate(BaseModel):
    name: str
    description: str
    points_cost: int
    category: RewardCategory


class RewardResponse(BaseModel):
    id: str
    name: str
    description: str
    points_cost: int
    category: RewardCategory
    is_active: bool


class RedeemRequest(BaseModel):
    customer_id: str
    reward_id: str


# --- POS ---
class OrderItem(BaseModel):
    menu_item_id: str
    name: str
    qty: int
    price: int


class OrderCreate(BaseModel):
    customer_id: Optional[str] = None
    table_id: str
    items: list[OrderItem]
    points_used: int = 0


# --- Roles ---
class UserRole(str, Enum):
    owner = "owner"
    admin = "admin"
    cashier = "cashier"
    kitchen = "kitchen"


class OrderResponse(BaseModel):
    id: str
    customer_id: Optional[str]
    customer_name: Optional[str]
    items: list[OrderItem]
    subtotal: int
    discount: int
    points_used: int
    total: int
    points_earned: int
    status: str
    created_at: str


# --- Chat ---
class MessageSender(str, Enum):
    customer = "customer"
    bot = "bot"
    agent = "agent"


class ChatMessageCreate(BaseModel):
    conversation_id: str
    content: str
    sender: MessageSender = MessageSender.agent


class ChatMessageResponse(BaseModel):
    id: str
    conversation_id: str
    customer_id: str
    content: str
    sender: MessageSender
    timestamp: str
    read: bool
