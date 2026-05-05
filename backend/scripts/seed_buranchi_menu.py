"""Replace Buranchi's menu with the real menu from the printed menu cards.

One-off — run after migration 033. Wipes existing menu_items for Buranchi
and inserts the 65 items across 9 categories (Appetizer, Main, Side,
Dessert, Coffee, Matcha, Mocktail, Tea, Beverage).

Prices are stored as integer rupiah (so menu price `55` → 55000).

Run:
  cd backend
  .venv\\Scripts\\python.exe scripts\\seed_buranchi_menu.py
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.db import get_db  # noqa: E402

BURANCHI_TID = "00000000-0000-0000-0000-000000000001"

# (name, price_in_thousands, category, description)
MENU: list[tuple[str, float, str, str]] = [
    # ===== APPETIZER — Asian =====
    ("Crispy Chicken Skin", 55, "Appetizer",
     "Crispy fried chicken skin, wasabi mayo"),
    ("Chicken Karaage", 58, "Appetizer",
     "Crunchy juicy deep fried chicken, wasabi mayo dipping sauce"),
    ("Cheesy Meatball Marinara", 68, "Appetizer",
     "Housemade baked meatball topped with cheese and marinara sauce, served with browned garlic bread"),
    ("Gyoza", 69, "Appetizer",
     "Pan fried Japanese dumplings, shoyu dipping sauce"),

    # ===== APPETIZER — Western =====
    ("Parmesan Chicken Wings", 55, "Appetizer",
     "Chicken wings, garlic marinade, parmesan cheese"),
    ("Escargot", 55, "Appetizer",
     "Baked snails with garlic butter herbs, served with browned garlic bread"),
    ("Truffle Mac & Cheese Bites", 55, "Appetizer",
     "Fried breaded truffle creamy mac and cheese, served with mixed green salad"),
    ("Classic Nachos", 59, "Appetizer",
     "Tortilla chips, cheese sauce, tomato salsa, guacamole"),
    ("Calamari Fritti", 85, "Appetizer",
     "Deep fried fresh calamari coated with Italian herbs, served with tomato cocktail & tartar sauce"),

    # ===== MAIN — Asian =====
    ("Crispy Dory Salted Egg", 69.5, "Main",
     "Deep fried dory with salted egg sauce, white rice, sunny side up egg"),
    ("Kampoeng Fried Rice", 73, "Main",
     "Kampoeng fried rice, grilled chicken, fried egg, kerupuk kampoeng, pineapple acar"),
    ("Cumi Sambal Ijo", 78, "Main",
     "Sauteed baby squid, sambal ijo, vegetables, petai"),
    ("Crispy Garlic Fried Chicken", 78, "Main",
     "Crispy fried chicken, fried garlic, sambal bawang"),
    ("Chicken Nanban Rice Bowl", 79, "Main",
     "Crunchy juicy marinated fried chicken over furikake Japanese rice, with tartar sauce"),
    ("Dory Dabu Dabu", 95, "Main",
     "Pan-seared dory, sambal dabu dabu, sauteed spinach, deep fried tofu balls"),
    ("Salmon Aburi Don", 115, "Main",
     "Torched salmon, teriyaki sauce, Japanese rice"),
    ("Wagyu Steak Fried Rice", 139, "Main",
     "Wagyu steak, tornado egg over wagyu tallow teppanyaki fried rice"),
    ("Crispy Balinese Fried Duck", 165, "Main",
     "Crispy succulent half duck, savoury duck broth, sambal matah, sambal bawang, urap sayur"),
    ("Oxtail Soup / Oseng", 175, "Main",
     "Oxtail bone broth soup, vegetables, sambal ijo, emping, condiments"),

    # ===== MAIN — Western =====
    ("Smoked Chicken Mac n Cheese", 80, "Main",
     "Baked macaroni, smoky cheddar sauce, grilled chicken, served with yuzu salad"),
    ("Fish n' Chips", 85, "Main",
     "Tempura-battered dory, creamy cheese sauce, served with french fries"),
    ("Roasted Spring Chicken", 115, "Main",
     "Half roasted spring chicken, chicken gravy, mashed potatoes, mesclun salad"),
    ("Truffle Mushroom Fettuccine", 119, "Main",
     "Truffle cream sauce, mixed wild mushrooms, fettuccine"),
    ("Spaghetti Aglio Olio", 119, "Main",
     "Garlic chicken broth-infused olive oil, kalamata olives, grana padano cheese — choice of chicken / mushroom"),
    ("Wagyu Gourmet Burger", 119, "Main",
     "Wagyu beef patty, beef bacon, secret sauce, smoked cheddar cheese, brioche bun, served with french fries"),
    ("Wagyu Harami MB 6/7 (180gr)", 245, "Main",
     "Wagyu Harami cut MB 6/7, chimichurri sauce, crispy wedges potatoes, vegetables"),
    ("Australian Wagyu Sirloin MB2 (180gr)", 245, "Main",
     "Australian Wagyu Sirloin MB2 with potatoes, vegetables, salad, mushroom/barbecue sauce, butter steak sauce"),

    # ===== SIDE =====
    ("White Rice", 10, "Side", ""),
    ("Kecombrang Rice", 20, "Side", ""),
    ("Truffle Fries", 65, "Side",
     "Crispy french fries, truffle oil, garlic aioli, parmesan cheese"),
    ("Grilled Caesar Salad", 85, "Side",
     "Grilled baby romaine, radish greens, rosemary, pea tendrils, homemade caesar dressing, grana padano — choice of chicken / beef bacon"),

    # ===== DESSERT =====
    ("Tape Goreng", 45, "Dessert",
     "Tempura battered fermented cassava, matcha cream sauce"),
    ("Banoffee Crepes", 69, "Dessert",
     "House-made crepe, caramelized bananas, butter biscuit crumble, strawberries, vanilla ice cream, butterscotch sauce"),
    ("Buranchi Honey Toast", 95, "Dessert",
     "Signature honey toast, caramelized bananas, vanilla ice cream, creme anglaise"),
    ("Ice Cream by Stories of Sunday (Single)", 45, "Dessert",
     "Handmade ice cream by Stories of Sunday — ask for today's flavors"),
    ("Ice Cream by Stories of Sunday (Double)", 75, "Dessert",
     "Handmade ice cream by Stories of Sunday — ask for today's flavors"),
    ("Matcha Basque Cheesecake Original", 61, "Dessert",
     "Dust of matcha powder on top — pure, bold, bittersweet matcha"),
    ("Matcha Brulee", 63, "Dessert",
     "Caramelized sugar on top with golden crunch, torched for a satisfying crack into creamy matcha base"),
    ("Matcha Strawberry Thyme Jam", 67, "Dessert",
     "Housemade strawberry thyme jam in a small jug — herbal notes paired with rich matcha base"),

    # ===== COFFEE =====
    ("Espresso", 29, "Coffee", ""),
    ("Americano (Hot)", 35, "Coffee", ""),
    ("Americano (Iced)", 37, "Coffee", ""),
    ("Latte (Hot)", 37, "Coffee", ""),
    ("Latte (Iced)", 39, "Coffee", ""),
    ("Piccolo", 37, "Coffee", ""),
    ("Flat White (Hot)", 37, "Coffee", ""),
    ("Flat White (Iced)", 39, "Coffee", ""),
    ("Cappuccino (Hot)", 37, "Coffee", ""),
    ("Cappuccino (Iced)", 39, "Coffee", ""),
    ("Cocoa (Hot)", 37, "Coffee", ""),
    ("Cocoa (Iced)", 39, "Coffee", ""),
    ("Sparkling Lemonade Cold Brew", 45, "Coffee", "Iced — signature"),
    ("Brown Sugar Coffee", 49, "Coffee", "Iced — signature"),
    ("Salted Caramel Latte", 49, "Coffee", "Iced — signature"),
    ("Coffee Bear Latte", 49, "Coffee", "Iced — signature"),

    # ===== MOCKTAIL =====
    ("Ichigo Sawa", 49, "Mocktail", "Iced"),
    ("Yuzu Minto", 49, "Mocktail", "Iced"),
    ("Momo Marita", 49, "Mocktail", "Iced"),
    ("Kyuri Coco Aloe", 49, "Mocktail", "Iced"),
    ("Gogo Strawberry", 49, "Mocktail", "Iced"),

    # ===== TEA =====
    ("Iced Tea", 25, "Tea", ""),
    ("Iced Lemon Tea", 28, "Tea", ""),
    ("Osmanthus Grapefruit Tea", 35, "Tea", ""),
    ("Iced Lychee Tea", 38, "Tea", ""),
    ("Rose Lychee Tea", 42, "Tea", ""),

    # ===== MATCHA =====
    ("Usucha", 55, "Matcha",
     "Premium — Ceremonial Buranchi Blend, water (iced)"),
    ("Premium Matcha Latte", 63, "Matcha",
     "Premium — Ceremonial Buranchi Blend, fresh milk (oat milk +12k, iced)"),
    ("Matcha Cold Whisk", 68, "Matcha",
     "Premium — Ceremonial Buranchi Blend, fresh milk (oat milk +12k, iced)"),
    ("Matcha Latte (Hot)", 44, "Matcha",
     "Yabukita Blend, fresh milk (oat milk +12k)"),
    ("Matcha Latte (Iced)", 49, "Matcha",
     "Yabukita Blend, fresh milk (oat milk +12k)"),
    ("Dirty Matcha Latte", 54, "Matcha",
     "Yabukita Blend, espresso, fresh milk (oat milk +12k, iced)"),
    ("Strawberry Matcha Latte", 57, "Matcha",
     "Yabukita Blend, homemade strawberry jam, thyme syrup, fresh milk (oat milk +12k, iced)"),
    ("Coconut Cloud Matcha", 57, "Matcha",
     "Matcha cream, coconut water, coconut flakes (iced)"),
    ("Matcha Banana Pudding", 59, "Matcha",
     "Yabukita Blend, banana pudding, banana syrup, fresh milk (oat milk +12k, iced)"),
    ("Tiramisu Matcha Latte", 59, "Matcha",
     "Yabukita Blend, tiramisu syrup, tiramisu cream, lady finger, fresh milk (oat milk +12k, iced)"),
    ("Matcha Yuzu Ade", 59, "Matcha",
     "Yabukita Blend, yuzu juice, pineapple juice, osmanthus syrup, soda (iced)"),

    # ===== BEVERAGE — water =====
    ("Infused Water (Cucumber)", 22, "Beverage", ""),
    ("Infused Water (Lemon)", 22, "Beverage", ""),
    ("Reflections Mineral Water", 29, "Beverage", ""),
]


def main() -> None:
    db = get_db()

    existing = db.table("menu_items").select(
        "id", count="exact"
    ).eq("tenant_id", BURANCHI_TID).execute()
    print(f"[1/3] Found {existing.count or 0} existing menu items for Buranchi")

    if existing.data:
        ids = [m["id"] for m in existing.data]
        for chunk_start in range(0, len(ids), 100):
            chunk = ids[chunk_start: chunk_start + 100]
            db.table("menu_items").delete().in_("id", chunk).execute()
        print(f"      Deleted {len(ids)}")

    print(f"\n[2/3] Inserting {len(MENU)} real-menu items...")
    rows = [
        {
            "tenant_id": BURANCHI_TID,
            "name": name,
            # Convert thousands → rupiah; round to nearest 100 for half-prices
            # like 69.5 → 69500.
            "price": int(round(price * 1000)),
            "category": category,
            "description": description,
            "is_available": True,
        }
        for name, price, category, description in MENU
    ]
    # Insert in chunks of 50
    for chunk_start in range(0, len(rows), 50):
        chunk = rows[chunk_start: chunk_start + 50]
        db.table("menu_items").insert(chunk).execute()

    print(f"      Inserted {len(rows)} items")

    print("\n[3/3] Verifying by category...")
    final = db.table("menu_items").select(
        "category"
    ).eq("tenant_id", BURANCHI_TID).execute().data
    from collections import Counter
    counts = Counter(i["category"] for i in final)
    for cat, n in sorted(counts.items()):
        print(f"      {cat}: {n}")
    print(f"      TOTAL: {len(final)}")

    print("\n" + "=" * 50)
    print("Buranchi menu seeded with the real printed menu.")
    print("=" * 50)


if __name__ == "__main__":
    main()
