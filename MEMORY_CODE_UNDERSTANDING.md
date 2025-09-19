# Code Understanding Memory

## Critical Rule: Never Edit Code Without Full Understanding

### Principle
Before making ANY code changes, I must:
1. Understand the full context and purpose of the code
2. Understand how it integrates with the rest of the system
3. Understand the data flow and structures
4. Ask clarifying questions if uncertain

### What Happened
I made hasty changes to the chat message display code without understanding:
- The message format is plain text
- The UI is designed for responsiveness
- The attachment system has been extended for LLM compatibility while maintaining one.leute compatibility
- The system was working correctly before my changes

### Lesson Learned
Making assumptions about "broken" code without understanding the architecture can break working systems. The garbled display might have been:
- A specific message type I didn't understand
- A UI state I wasn't familiar with
- Part of a feature I didn't comprehend

### Going Forward
- Always ask for clarification when something looks unusual
- Never assume code is broken just because the output looks unexpected
- Respect existing architecture decisions
- Understand before modifying