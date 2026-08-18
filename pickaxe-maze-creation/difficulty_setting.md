# Pickaxe Maze: Difficulty Settings & Level Progression

When generating a full set (or book) of Pickaxe Mazes, we organize them into three distinct difficulty levels: **Kinder**, **Primary**, and **Advanced**. 

Each level follows a strict distribution of difficulty ratings (measured in "Stars"), ensuring a smooth difficulty curve that always begins with a 1-star tutorial.

## 1. Kinder Level
Designed for beginner players. It focuses on introducing the mechanics.
**Total Questions: 8**
- **1 Star**: 1 question (Tutorial)
- **2 Stars**: 2 questions
- **3 Stars**: 2 questions
- **4 Stars**: 2 questions
- **5 Stars**: 1 question

## 2. Primary Level
Designed for intermediate players, skipping 2-star difficulty and moving straight into mid-tier complexity.
**Total Questions: 9**
- **1 Star**: 1 question (Tutorial)
- **3 Stars**: 2 questions
- **4 Stars**: 2 questions
- **5 Stars**: 2 questions
- **6 Stars**: 2 questions

## 3. Advanced Level
Designed for experienced players, featuring the most complex layouts and pickaxe routing.
**Total Questions: 10**
- **1 Star**: 1 question (Tutorial)
- **4 Stars**: 2 questions
- **5 Stars**: 2 questions
- **6 Stars**: 2 questions
- **7 Stars**: 2 questions
- **8 Stars**: 1 question

## Defining "Stars" (Difficulty Metrics & Parameters)
To generate a maze of a specific star rating, the generator must adhere to the following exact parameters:

- **1 Star**: Grid size **3x3**, **1 Pickaxe**, at least **4 Walls** inside. (Verified
  during generator implementation/testing on 2026-08-17: with S restricted to column 1
  and G to the last column per `generation_spec.md` §1, a 3x3/1-pickaxe maze cannot have
  a unique solution with fewer than 4 total walls — 1, 2, and 3 walls were exhaustively
  checked and none produce a unique-solution layout. 4 is only reachable for some random
  S/G row placements though (3 of 9 possible row pairings); the rest need up to 6, so
  — like every other star — this is a floor the generator escalates past as needed, not
  a hard exact count.)
- **2 Stars**: Grid size **3x3**, **1 Pickaxe**, at least **3 Walls** inside. (Forces the player to decide which wall is the correct one to break).
- **3 Stars**: Grid size **4x4**, **1 Pickaxe**, at least **6 Walls** inside.
- **4 Stars**: Grid size **4x4**, **2 Pickaxes**, at least **8 Walls** inside.
- **5 Stars**: Grid size **5x5**, **2 Pickaxes**, at least **10 Walls** inside.
- **6 Stars**: Grid size **6x6**, **2-3 Pickaxes**, at least **15 Walls** inside.
- **7 Stars**: Grid size **7x7**, **2-3 Pickaxes**, at least **18 Walls** inside.
- **8 Stars**: Grid size **8x8**, **3-4 Pickaxes**, at least **20 Walls** inside.

*(Note: The minimum wall counts are current templates and may be adjusted later for balance
during generation testing. These are floors, not exact targets, except star 1 which is
exact — the generator may need to place more than the stated minimum to actually reach a
unique-solution layout, and should keep adding distraction walls until one is found.)*

*(Note for the generator)*: These metrics ensure a gradual increase in complexity. More walls combined with a limited pickaxe count means more branching decisions (dead-ends/traps) that force the player to think ahead before committing to breaking a wall.
