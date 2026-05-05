// Mock data — will be replaced with Supabase queries

export type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  points: number;
  totalVisits: number;
  totalSpent: number;
  tier: "Bronze" | "Silver" | "Gold" | "Diamond";
  isMember: boolean;
  joinedAt: string;
  lastVisit: string;
  tags: string[];
};

export type TableStatus = "available" | "reserved" | "occupied" | "cleaning";

export type RestaurantTable = {
  id: string;
  capacity: number;
  zone: "Indoor" | "Outdoor";
  status: TableStatus;
  currentBookingId?: string;
};

export type BookingStatus = "reserved" | "occupied" | "done" | "cancelled" | "no_show";

export type Booking = {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  date: string;
  time: string;
  partySize: number;
  status: BookingStatus;
  seating: "indoor" | "outdoor";
  guestName: string;
  tableId: string;
  notes: string;
};

export type ChatMessage = {
  id: string;
  customerId: string;
  customerName: string;
  content: string;
  timestamp: string;
  sender: "customer" | "bot" | "agent";
  read: boolean;
};

export type Conversation = {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  status: "active" | "resolved" | "bot";
};

export type LoyaltyReward = {
  id: string;
  name: string;
  description: string;
  pointsCost: number;
  category: "discount" | "freebie" | "experience";
  isActive: boolean;
};

export type TableOrder = {
  id: string;
  tableId: string;
  customerId?: string;
  customerName?: string;
  items: { menuItemId: string; name: string; qty: number; price: number }[];
  subtotal: number;
  discount: number;
  pointsUsed: number;
  total: number;
  status: "open" | "paid" | "cancelled";
  createdAt: string;
};

export type Campaign = {
  id: string;
  name: string;
  message: string;
  targetAudience: "all" | "member" | "non-member";
  audienceCount: number;
  status: "draft" | "scheduled" | "sent" | "failed";
  scheduledAt?: string;
  sentAt?: string;
  delivered: number;
  read: number;
};

export type UserRole =
  | "super_admin"
  | "tenant_owner"
  | "admin"
  | "cashier"
  | "marketing"
  | "staff";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

// Current user (mock)
export const currentUser: AppUser = {
  id: "u1",
  name: "Admin",
  email: "admin@buranchi.com",
  role: "tenant_owner",
};

// --- Tables ---
export const tables: RestaurantTable[] = [
  { id: "A1", capacity: 2, zone: "Indoor", status: "available" },
  { id: "A2", capacity: 2, zone: "Indoor", status: "reserved", currentBookingId: "b1" },
  { id: "A3", capacity: 4, zone: "Indoor", status: "occupied" },
  { id: "B1", capacity: 4, zone: "Indoor", status: "available" },
  { id: "B2", capacity: 6, zone: "Indoor", status: "available" },
  { id: "C1", capacity: 2, zone: "Outdoor", status: "available" },
  { id: "C2", capacity: 4, zone: "Outdoor", status: "reserved", currentBookingId: "b2" },
  { id: "C3", capacity: 4, zone: "Outdoor", status: "available" },
];

// --- Customers ---
export const customers: Customer[] = [
  { id: "c1", name: "Budi Santoso", phone: "+6281234567890", email: "budi@email.com", points: 1250, totalVisits: 24, totalSpent: 4800000, tier: "Gold", isMember: true, joinedAt: "2025-03-15", lastVisit: "2026-04-12", tags: ["reguler"] },
  { id: "c2", name: "Siti Nurhaliza", phone: "+6281234567891", email: "siti@email.com", points: 3200, totalVisits: 52, totalSpent: 12500000, tier: "Diamond", isMember: true, joinedAt: "2024-11-01", lastVisit: "2026-04-14", tags: ["vip"] },
  { id: "c3", name: "Ahmad Rizky", phone: "+6281234567892", email: "ahmad@email.com", points: 450, totalVisits: 8, totalSpent: 1600000, tier: "Silver", isMember: true, joinedAt: "2026-01-20", lastVisit: "2026-04-10", tags: [] },
  { id: "c4", name: "Dewi Lestari", phone: "+6281234567893", email: "dewi@email.com", points: 120, totalVisits: 3, totalSpent: 450000, tier: "Bronze", isMember: false, joinedAt: "2026-03-05", lastVisit: "2026-04-08", tags: [] },
  { id: "c5", name: "Reza Rahadian", phone: "+6281234567894", email: "reza@email.com", points: 2100, totalVisits: 35, totalSpent: 8200000, tier: "Gold", isMember: true, joinedAt: "2025-06-10", lastVisit: "2026-04-13", tags: ["reguler"] },
  { id: "c6", name: "Maya Indah", phone: "+6281234567895", email: "maya@email.com", points: 800, totalVisits: 15, totalSpent: 3100000, tier: "Silver", isMember: false, joinedAt: "2025-09-22", lastVisit: "2026-04-11", tags: [] },
];

// --- Bookings ---
export const bookings: Booking[] = [
  { id: "b1", customerId: "c1", customerName: "Budi Santoso", customerPhone: "+6281234567890", date: "2026-04-14", time: "19:00", partySize: 4, status: "reserved", seating: "indoor", guestName: "Budi Santoso", tableId: "A2", notes: "Anniversary dinner" },
  { id: "b2", customerId: "c2", customerName: "Siti Nurhaliza", customerPhone: "+6281234567891", date: "2026-04-14", time: "20:00", partySize: 2, status: "reserved", seating: "outdoor", guestName: "Siti Nurhaliza", tableId: "C2", notes: "" },
  { id: "b3", customerId: "c5", customerName: "Reza Rahadian", customerPhone: "+6281234567894", date: "2026-04-15", time: "12:00", partySize: 6, status: "reserved", seating: "indoor", guestName: "Reza Rahadian", tableId: "B2", notes: "Family lunch, need high chair" },
  { id: "b4", customerId: "c3", customerName: "Ahmad Rizky", customerPhone: "+6281234567892", date: "2026-04-15", time: "19:30", partySize: 2, status: "reserved", seating: "indoor", guestName: "Ahmad Rizky", tableId: "A1", notes: "" },
  { id: "b5", customerId: "c6", customerName: "Maya Indah", customerPhone: "+6281234567895", date: "2026-04-13", time: "18:00", partySize: 3, status: "done", seating: "outdoor", guestName: "Maya Indah", tableId: "C3", notes: "" },
  { id: "b6", customerId: "c4", customerName: "Dewi Lestari", customerPhone: "+6281234567893", date: "2026-04-12", time: "20:00", partySize: 2, status: "cancelled", seating: "indoor", guestName: "Dewi Lestari", tableId: "A1", notes: "" },
];

// --- Conversations ---
export const conversations: Conversation[] = [
  { id: "conv1", customerId: "c1", customerName: "Budi Santoso", customerPhone: "+6281234567890", lastMessage: "Oke siap, nanti malam jam 7 ya", lastMessageTime: "2026-04-14T10:30:00", unreadCount: 2, status: "active" },
  { id: "conv2", customerId: "c2", customerName: "Siti Nurhaliza", customerPhone: "+6281234567891", lastMessage: "Thanks! Udah di-booking ya", lastMessageTime: "2026-04-14T09:15:00", unreadCount: 0, status: "resolved" },
  { id: "conv3", customerId: "c3", customerName: "Ahmad Rizky", customerPhone: "+6281234567892", lastMessage: "Mau tanya menu baru dong", lastMessageTime: "2026-04-14T11:00:00", unreadCount: 1, status: "bot" },
  { id: "conv4", customerId: "c5", customerName: "Reza Rahadian", customerPhone: "+6281234567894", lastMessage: "Besok jadi makan siang ya, 6 orang", lastMessageTime: "2026-04-14T08:45:00", unreadCount: 0, status: "active" },
];

export const chatMessages: Record<string, ChatMessage[]> = {
  conv1: [
    { id: "m1", customerId: "c1", customerName: "Budi Santoso", content: "Halo, mau booking meja buat nanti malam bisa?", timestamp: "2026-04-14T10:00:00", sender: "customer", read: true },
    { id: "m2", customerId: "c1", customerName: "Budi Santoso", content: "Halo Kak Budi! Tentu bisa. Untuk berapa orang dan jam berapa ya?", timestamp: "2026-04-14T10:01:00", sender: "bot", read: true },
    { id: "m3", customerId: "c1", customerName: "Budi Santoso", content: "4 orang, jam 7 malam. Indoor ya", timestamp: "2026-04-14T10:05:00", sender: "customer", read: true },
    { id: "m4", customerId: "c1", customerName: "Budi Santoso", content: "Siap Kak! Sudah saya booking meja A2 indoor untuk 4 orang jam 19:00 atas nama Budi Santoso. Ada request khusus?", timestamp: "2026-04-14T10:06:00", sender: "bot", read: true },
    { id: "m5", customerId: "c1", customerName: "Budi Santoso", content: "Oke siap, nanti malam jam 7 ya", timestamp: "2026-04-14T10:30:00", sender: "customer", read: false },
    { id: "m6", customerId: "c1", customerName: "Budi Santoso", content: "Oh iya, ini anniversary dinner. Bisa prepare something special?", timestamp: "2026-04-14T10:30:30", sender: "customer", read: false },
  ],
  conv3: [
    { id: "m10", customerId: "c3", customerName: "Ahmad Rizky", content: "Mau tanya menu baru dong", timestamp: "2026-04-14T11:00:00", sender: "customer", read: false },
  ],
};

// --- Rewards ---
export const rewards: LoyaltyReward[] = [
  { id: "r1", name: "Diskon 10%", description: "Potongan 10% untuk total bill", pointsCost: 200, category: "discount", isActive: true },
  { id: "r2", name: "Free Dessert", description: "Gratis 1 dessert pilihan", pointsCost: 150, category: "freebie", isActive: true },
  { id: "r3", name: "Diskon 25%", description: "Potongan 25% untuk total bill", pointsCost: 500, category: "discount", isActive: true },
  { id: "r4", name: "Free Main Course", description: "Gratis 1 main course pilihan", pointsCost: 400, category: "freebie", isActive: true },
  { id: "r5", name: "Chef's Table", description: "Makan malam eksklusif di Chef's Table untuk 2", pointsCost: 1500, category: "experience", isActive: true },
  { id: "r6", name: "Free Beverage", description: "Gratis 1 minuman pilihan", pointsCost: 100, category: "freebie", isActive: true },
];

// --- Campaigns ---
export const campaigns: Campaign[] = [
  { id: "camp1", name: "Promo Weekend Special", message: "Hai {name}! Weekend ini ada promo special. Diskon 20% untuk semua menu!", targetAudience: "all", audienceCount: 245, status: "sent", sentAt: "2026-04-11T10:00:00", delivered: 238, read: 156 },
  { id: "camp2", name: "Member Exclusive", message: "Hi {name}! Khusus member, dapet FREE dessert + 2x points bulan ini!", targetAudience: "member", audienceCount: 142, status: "sent", sentAt: "2026-04-01T08:00:00", delivered: 140, read: 98 },
  { id: "camp3", name: "Join Member Promo", message: "Hai {name}! Yuk jadi member kami. Dapet diskon 15% langsung + bonus 200 points!", targetAudience: "non-member", audienceCount: 103, status: "scheduled", scheduledAt: "2026-04-16T10:00:00", delivered: 0, read: 0 },
  { id: "camp4", name: "New Menu Launch", message: "Hi {name}! Ada menu baru nih, jangan sampai kelewatan ya!", targetAudience: "all", audienceCount: 245, status: "draft", delivered: 0, read: 0 },
];

// --- POS Menu ---
export const posMenuItems = [
  { id: "menu1", name: "Nasi Goreng Truffle", price: 89000, category: "Main" },
  { id: "menu2", name: "Wagyu Rendang Sushi", price: 145000, category: "Main" },
  { id: "menu3", name: "Soto Betawi Premium", price: 75000, category: "Main" },
  { id: "menu4", name: "Ayam Bakar Madu", price: 68000, category: "Main" },
  { id: "menu5", name: "Es Teh Tarik", price: 28000, category: "Beverage" },
  { id: "menu6", name: "Kopi Susu Aren", price: 35000, category: "Beverage" },
  { id: "menu7", name: "Lychee Fizz", price: 38000, category: "Beverage" },
  { id: "menu8", name: "Matcha Latte", price: 42000, category: "Beverage" },
  { id: "menu9", name: "Panna Cotta Pandan", price: 55000, category: "Dessert" },
  { id: "menu10", name: "Klepon Cake", price: 48000, category: "Dessert" },
];

// --- Table Orders (active) ---
export const tableOrders: TableOrder[] = [
  {
    id: "ord1", tableId: "A3", customerId: "c2", customerName: "Siti Nurhaliza",
    items: [
      { menuItemId: "menu2", name: "Wagyu Rendang Sushi", qty: 2, price: 145000 },
      { menuItemId: "menu6", name: "Kopi Susu Aren", qty: 2, price: 35000 },
    ],
    subtotal: 360000, discount: 0, pointsUsed: 0, total: 360000, status: "open", createdAt: "2026-04-14T12:30:00",
  },
];

// --- Dashboard stats ---
export const dashboardStats = {
  totalCustomers: 245,
  totalMembers: 142,
  newCustomersThisMonth: 18,
  totalBookingsToday: 12,
  occupancyRate: 78,
  revenueToday: 8750000,
  revenueThisMonth: 142500000,
  avgOrderValue: 285000,
  activeConversations: 8,
  loyaltyPointsIssued: 15200,
};

// --- snake_case API-shaped fallbacks ---

export const mockCustomersApi = customers.map((c) => ({
  id: c.id,
  name: c.name,
  phone: c.phone,
  email: c.email,
  points: c.points,
  total_visits: c.totalVisits,
  total_spent: c.totalSpent,
  tier: c.tier,
  is_member: c.isMember,
  joined_at: c.joinedAt,
  last_visit: c.lastVisit,
  tags: c.tags,
}));

export const mockTablesApi = tables.map((t, i) => ({
  id: i + 1,
  capacity: t.capacity,
  zone: t.zone,
  status: t.status,
}));

export const mockBookingsApi = (() => {
  const today = new Date();
  const isoToday = today.toISOString().split("T")[0];
  const addDays = (n: number) => {
    const d = new Date(today);
    d.setDate(today.getDate() + n);
    return d.toISOString().split("T")[0];
  };
  const dateOffsets: Record<string, string> = {
    "2026-04-14": isoToday,
    "2026-04-15": addDays(1),
    "2026-04-13": addDays(-1),
    "2026-04-12": addDays(-2),
  };
  return bookings.map((b, i) => {
    const tableIdx = tables.findIndex((t) => t.id === b.tableId);
    return {
      id: i + 1,
      customer_id: b.customerId ? Number(b.customerId.replace("c", "")) : null,
      date: dateOffsets[b.date] ?? b.date,
      time: b.time,
      party_size: b.partySize,
      table_id: tableIdx >= 0 ? tableIdx + 1 : null,
      status: b.status,
      guest_name: b.guestName,
      customer_phone: b.customerPhone,
      notes: b.notes,
      seating: b.seating,
      customers: { name: b.customerName },
    };
  });
})();

export const mockConversationsApi = conversations.map((c) => ({
  id: c.id,
  customer_id: c.customerId,
  last_message: c.lastMessage,
  last_message_time: c.lastMessageTime,
  unread_count: c.unreadCount,
  status: c.status,
  platform: "WhatsApp",
  customers: { name: c.customerName, phone: c.customerPhone },
}));

export const mockMessagesApi: Record<string, {
  id: string;
  conversation_id: string;
  customer_id: string;
  content: string;
  sender: string;
  timestamp: string;
  read: boolean;
}[]> = Object.fromEntries(
  Object.entries(chatMessages).map(([convId, msgs]) => [
    convId,
    msgs.map((m) => ({
      id: m.id,
      conversation_id: convId,
      customer_id: m.customerId,
      content: m.content,
      sender: m.sender,
      timestamp: m.timestamp,
      read: m.read,
    })),
  ])
);

export const mockRewardsApi = rewards.map((r) => ({
  id: r.id,
  name: r.name,
  description: r.description,
  points_cost: r.pointsCost,
  category: r.category,
  is_active: r.isActive,
}));

export const mockCampaignsApi = campaigns.map((c) => ({
  id: c.id,
  name: c.name,
  message: c.message,
  audience: c.targetAudience,
  target_audience: c.targetAudience,
  audience_count: c.audienceCount,
  status: c.status,
  scheduled_at: c.scheduledAt ?? null,
  sent_at: c.sentAt ?? null,
  delivered: c.delivered,
  read: c.read,
}));

export const mockMenuApi = posMenuItems.map((m, i) => ({
  id: i + 1,
  name: m.name,
  price: m.price,
  category: m.category,
}));

export const mockDashboardStats = (() => {
  const today = new Date().toISOString().split("T")[0];
  const topCustomers = [...mockCustomersApi]
    .sort((a, b) => b.points - a.points)
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      name: c.name,
      points: c.points,
      tier: c.tier,
      total_visits: c.total_visits,
      total_spent: c.total_spent,
    }));

  const todayBookings = mockBookingsApi
    .filter((b) => b.status === "reserved" || b.status === "occupied")
    .slice(0, 6)
    .map((b) => ({
      id: String(b.id),
      guest_name: b.guest_name,
      time: b.time,
      party_size: b.party_size,
      table_id: String(b.table_id ?? "-"),
      status: b.status,
    }));

  const recentConversations = mockConversationsApi.slice(0, 4).map((c) => ({
    id: c.id,
    last_message: c.last_message,
    last_message_time: c.last_message_time,
    unread_count: c.unread_count,
    status: c.status,
    customers: c.customers,
  }));

  const dayShort = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
  const dayFull = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
  const weekTotals = [9200000, 11400000, 8800000, 14700000, 12300000, 24500000, 18600000];
  const base = new Date(today);
  const offset = (base.getDay() + 6) % 7;
  base.setDate(base.getDate() - offset);
  const revenueWeek = weekTotals.map((total, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return {
      date: d.toISOString().split("T")[0],
      day_short: dayShort[i],
      day_full: dayFull[i],
      total,
    };
  });
  const revenueWeekTotal = weekTotals.reduce((s, v) => s + v, 0);

  return {
    total_customers: 245,
    revenue_today: 8750000,
    total_bookings_today: todayBookings.length,
    avg_order_value: 285000,
    top_customers: topCustomers,
    today_bookings: todayBookings,
    recent_conversations: recentConversations,
    revenue_week: revenueWeek,
    revenue_week_total: revenueWeekTotal,
    revenue_week_avg: Math.round(revenueWeekTotal / 7),
  };
})();
