# Game Based on the Movie **“Alice in Borderland”**  
## King of Diamonds


**Website:** [https://king-of-diamonds-alice-in-borderland.onrender.com](https://king-of-diamonds-alice-in-borderland.onrender.com)

**Description:**  
The game runs **very slowly** on the hosted server.  
However, it performs **much faster** locally.

---

## How It Works

1. You enter the site.
2. Choose your language and name.
3. Create or join a room.

> ⚠️ **Important:** If you refresh the page during the game, you will be disconnected and **won’t be able to rejoin**. Rejoining during an active game is not allowed.

---

## Rules

- The game is designed for **5 players**.
- If fewer players join, **bots** will fill the remaining spots.
- Bots use an **exponential distribution** from 0 to 100 (they tend to choose lower numbers more often).
- Each round is 3 minutes long. If you don’t enter a number in time, one will be automatically generated for you using an exponential distribution.

### Round:

1. Each player picks a number between `0` and `100`.
2. The **average** of all numbers is calculated.
3. The average is multiplied by `0.8`.
4. The player whose number is **closest to the result** wins the round.
5. The winner gains nothing, but all **others lose 1 point**.
6. Everyone starts with **10 points**.
7. A player is eliminated when they reach **0 points**.

---

## Interface and Display

- On the right: list of players, what number each entered, and the **resulting average** (multiplied by 0.8).
- Each new additional rule is **cumulative**, unless it's **mutually exclusive**.
- With 4 or fewer players, extra rules are applied to avoid ties.

---

## Additional Rules:

- **5 players**: ties are possible, and no points are lost in a tie.
- **4 players**: if two or more players choose the same number, that number is **nullified**, and those players lose 1 point.
- **3 players**: if someone picks the **exact winning number**, the other two **lose 2 points** each.
- **2 players**: if one chooses `0` and the other `100`, the player who chose **100 wins**.

---

## Technical Info

- **Node.js**: `v22.15.0`
- **Express.js**
- Development mode: `npm run dev`
- start: `npm run start`
