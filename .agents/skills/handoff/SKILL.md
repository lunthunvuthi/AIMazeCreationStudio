---
name: handoff
description: Creates a handoff document to summarize the current state of the project for future sessions.
---

# Handoff Skill

When the user asks for a "handoff" or to create a handoff document, follow these steps:

1. Check the `handoffs/` directory in the root of the project to see existing handoff files. If the directory doesn't exist, it will be created when you write the file.
2. Determine the current date in `YYYYMMDD` format.
3. Determine the next index number for the date. Handoff files should be named `handoff_YYYYMMDD_XX.md` (e.g., `handoff_20260815_01.md`, `handoff_20260815_02.md`).
4. Create the new handoff file in the `handoffs/` directory using the `write_to_file` tool.
5. The handoff file should contain:
   - **Date & Time**: When the handoff was created.
   - **Current State**: A brief summary of what has been accomplished in the current session.
   - **Next Steps**: What needs to be done in the next session based on the conversation.
   - **Important Context**: Any relevant context the next agent needs to know (e.g., specific rules, paths to important files).
