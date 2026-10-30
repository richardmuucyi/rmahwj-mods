---
type: concept
tags:
  - knowledge-transfer
  - handover
  - career
  - checklist
aliases:
  - KT question bank
  - Handover question bank
---

# Knowledge Transfer Question Bank

> [!abstract]
> A reusable set of questions for receiving the handover of any software system when you are new to its
> business, its technology and its people. Every question comes with what it means in plain words, what a good
> answer sounds like, and what to ask next if the answer is vague. Use it to prepare, to run the sessions, and
> to check afterwards that nothing was missed. A further section covers the other side: answering questions put to
> *you* that you can't answer yet, without bluffing and without losing trust. It was first written for one real project handover (2026-10-22),
> then made generic, and checked against the arc42 template, the AWS Well-Architected pillars, the ISO 25010
> quality list and SRE production-readiness reviews.

> [!info] About the sample answers
> The sample answers come from **one made-up system**: an online service where small businesses apply for a
> permit and staff officers review the applications. The numbers and names are illustrations; your project's
> answers will differ. Judge a real answer by its shape: a good one is **specific** (names, numbers, dates),
> says **how the person knows**, and tells you **where you can see it yourself**. Every word in *italics* and
> every technical word is explained in the question or in the [glossary](#glossary).

## How to use this bank

1. **Collect what exists first.** Ask for the README (the "read me first" file in the code), any architecture
   diagram, handover notes, runbooks, a list of environments and the open tickets. Read them before the first
   session. Cross out every question they already answer, and ask instead: "Is this still current?"
2. **Tailor the questions.** A generic question gets a generic answer. Turn each one into a question about this
   system (see [Turning a generic question into a tailored one](#turning-a-generic-question-into-a-tailored-one)).
3. **Choose what to ask aloud.** The full bank is 124 questions, about 12 hours if you ask every one aloud in meetings.
   You will rarely get that. So:
   - ask every **★ must-ask** question aloud (38 of them);
   - send the others in writing and ask for short written answers;
   - skip any that don't apply (a system with no screens skips C7; a system with no AI model skips area M).
4. **Plan the sessions.** Plan 8–12 questions per hour; each takes 5–7 minutes with its follow-ups. A session
   holds more questions than that, so ask only its ★ questions aloud and send the rest in writing. That is why the six sessions take
   8–9 hours, not 12.

   | Session | Areas | Length |
   |---|---|---|
   | 1. The business | A, B | 60–90 min |
   | 2. How it works | C, D, E | 90 min, screen shared |
   | 3. The code | K | 90 min, screen shared |
   | 4. Where it runs | F, G, H | 90 min |
   | 5. Speed and running it | I, J | 90 min |
   | 6. AI parts and taking over | M, L | 60–90 min |

5. **If you get only one hour,** ask these twelve: A1, B2, C1, C2, F3, F4, J2, J3, K1, K9, L1, L8.
6. **Send the questions two working days ahead,** so the other person can bring numbers instead of guesses.
7. **Take notes in the table at the end** while you listen, not afterwards.

## How to ask

### Opening the session
- "Thank you for making time. I'm new to this system, its business and its technology, so some of my questions
  will be basic. My goal is to be able to run, fix and support it on my own."
- "I sent my questions ahead. If you think something else matters more, please tell me. You know where the
  risks are."
- "Would you mind if I record this, so I don't miss details?" (Ask before you start recording.)

### The follow-up ladder
Most first answers are short. Climb these five steps until the answer is something you could act on alone.

1. **What?** "Could you walk me through what happens when …?"
2. **How do you know?** "Is that measured, or is it from experience?"
3. **Where can I see it?** "Could you show me the dashboard, log, file or ticket?"
4. **What if it goes wrong?** "What happens when that fails? Has it ever happened?"
5. **Who else knows?** "If you're not available, who would I ask?"

### While you listen
Use these the moment you lose the thread. Asking at once costs a few seconds; guessing costs a wrong note.

| When | Say |
|---|---|
| You missed a word | "Sorry, could you say that again? I missed the last part." |
| They speak too fast | "Could you slow down a little? I'm taking notes." |
| A name or short form | "Could you spell that for me?" · "What does … stand for?" |
| A word you don't know | "What does '…' mean here?" |
| A number | "Was that fifteen or fifty?" · "Is that per day or per month?" |
| You need time to write | "One moment, please. I'm writing that down." |
| You followed part of it | "I followed you up to … Could you explain the part after that again?" |
| Two topics at once | "Could we take one at a time? First …" |
| You think you have it | "Let me check I understood: … Is that right?" |
| Something on the screen | "Could you show me where that is on the screen?" |

### Instead of … ask …
| Instead of | Ask |
|---|---|
| "How many users?" | "Roughly how many people use it on a normal day, and what was the busiest day you have seen?" |
| "Is it fast?" | "Do we have numbers for response time or throughput? Where can I see them?" |
| "Is it secure?" | "Which security checks are done, and what did the last one find?" |
| "Why did you do it like this?" | "What led to this design? Was there an option you decided against?" |
| "Who broke it?" | "What happened in that incident, and what would you watch for now?" |
| "This looks wrong." | "This surprised me. Could you help me understand why it works this way?" |
| "I don't understand." | "Let me play that back to check I have it right: … Is that correct?" |
| "Is there documentation?" | "Which documents do you trust, and which are out of date?" |
| "Anything else?" | "What do you know about this system that isn't written down anywhere?" |

### When an answer is hard to use
- **Vague:** "Could you give me one real example?"
- **"It depends":** "What does it depend on? What is the most common case?"
- **"I don't know":** "That's fine. Who would know? Could you introduce me?"
- **Defensive:** keep it about the system, not the person. "I'm asking so I don't make the same mistake when it's
  mine to run."
- **Too much detail:** "That's really useful. Could we note it and come back to it? I'd like to cover X first."
- **Time is running out:** "We have ten minutes left. Could we do the ★ questions I haven't asked yet?"

### Closing
- "Let me summarise what I heard: … The open items are …, owned by …. I'll send my notes today."
- "Is there anything I should have asked and didn't?"
- "Could we have a 30-minute follow-up in a week, after I've tried things on my own?"

### After the session
- Send your notes the same day: each answer, where it can be seen, every decision, and each open item with an
  owner and a date. Ask the other person to correct anything you got wrong.
- Put new words into your project glossary and new facts into your runbook.
- Try something yourself within the week (build it, release to test, read a log). Bring what blocked you to the
  follow-up.

## When you are the one being asked

During and after a handover, people will ask *you* questions: your manager, the business, other teams, vendors,
auditors. Many will be about things you have not learnt yet. This section is about answering well when you don't
know, or only partly know.

### Why "I'll find out" is safe
- Nobody expects a new owner to know everything. They expect you to be **honest about what you know** and to
  **come back when you said you would**.
- Trust rests on two things: when you say you are sure, you are right; when you promise a reply, it arrives on time.
- A confident wrong answer costs far more than "I'll check". Someone may act on it (book a date, tell a client,
  change a setting), and then the mistake is theirs to undo and yours to explain.
- What makes people doubt a newcomer is not "I don't know". It is guessing, going quiet, or getting defensive.
  "I don't know yet, I'll find out by Thursday", followed by the answer on Thursday, usually *raises* their opinion
  of you.
- One wrong answer, corrected quickly, does not make you unfit for the role. A habit of bluffing does.

### The answer ladder
For any question you can't fully answer, climb these five steps. It usually takes less than a minute.
1. **Check the question.** "Just to make sure I answer the right thing: do you mean the test system or production?"
2. **Give what you do know, and say how sure you are.** "What I can confirm is that the nightly job ran. Why it was
   slow, I don't know yet."
3. **Name the gap plainly.** "I don't have that detail yet." No long apology, no excuse.
4. **Promise a next step with a time.** "I'll check with the database team and come back to you by 3 pm tomorrow."
5. **Close the loop in writing.** Send the answer when you have it, even a partial one, and say what is still open.

### Say how sure you are
Use three levels and keep to them, so people learn what your words mean.

| How sure | Say | Example |
|---|---|---|
| Sure: you checked it | "Yes, it's …", plus how you know | "Yes, uploads are capped at 10 MB. I checked the configuration this morning." |
| Fairly sure: you remember it or were told | "My understanding is …, but let me confirm before you rely on it." | "My understanding is that the certificate renews in March. Let me confirm the date and send it to you." |
| Don't know | "I don't know yet. I'll find out and reply by …" | "I don't know yet. I'll ask the vendor and reply by Friday." |

Words such as "should be fine", "I think maybe" and "probably" blur the levels, so people can't tell which one you
meant. Avoid them for anything someone will act on.

### What to say when …
| Situation | Say | Avoid |
|---|---|---|
| You don't know at all | "I don't know yet, but I'll find out. I'll get back to you by [time]." | Guessing; "No idea." |
| You know part of it | "Part of it I can answer now: … The rest I need to check. I'll send it by [time]." | Answering the part you know as if it were the whole |
| Someone else owns the answer | "That one sits with [team]. I'll ask them and cc you, so you hear it first-hand." | "Not my area." |
| It happened before you joined | "That was before my time. I'll check the records and ask [name], then come back to you." | Blaming the previous owner |
| They want a date or a number now | "I don't want to give you a date that turns out wrong. I'll check with [who] and give you a firm one by [day]." | A number you can't back up |
| A rough idea is enough | "Roughly two to three weeks, if the vendor replies this week. I'll firm it up by Friday." | One number with no conditions |
| They ask you to commit on the spot | "I want to give you a realistic answer. Can I confirm with the team and come back tomorrow morning?" | "Yes, no problem", just to end the moment |
| A senior person asks in front of a group | "Let me take that offline so I give you the right figure. I'll send it to everyone today." | Thinking aloud in front of the room |
| The question has a wrong assumption in it | "Just to clarify, the job runs at 2 am, not midnight. With that in mind, …" | Answering as if the assumption were true |
| The question is really a complaint | "I understand this held up your team. Here's what I know so far, and here's what I'm doing next." | Defending the system first |
| The question feels like a test, or is hostile | Stay calm and factual: "Here's what I know, and here's what I'll check." | Matching their tone |
| The question has several parts | "There are three parts there. Let me take them one at a time." | Answering only the last part |
| You didn't understand the question | "Sorry, could you put it another way? I want to answer the right thing." | Answering a different question |

### Different askers want different things
| Who asks | What they need | How to answer |
|---|---|---|
| Your manager, senior management | The bottom line, the risk, and any decision they must make | Lead with the answer in one sentence: "In brief, we're on track, there's one risk, and I need a decision on X by Friday." |
| Business users, the product owner | What it means for users and dates | Plain words, no jargon. The impact first, the cause second. |
| Technical peers, other teams | Details and evidence | It is fine to say "Let me look at the logs and send you what I find." |
| Vendors and partners | A decision or a commitment from you | Don't commit on the organisation's behalf: "I'll need to confirm that with [owner] before we agree." |
| Auditors, security, compliance | Exact facts and evidence | Never guess: "I'll get you the record." Answer in writing, and only what was asked. |
| Users with a problem | To be heard, and to know what happens next | Acknowledge the problem, then give the next step and when they will hear back. |

### Scenarios: senior management
Directors and management want the bottom line, the risk and what you need from them, in that order. Keep it short;
they will ask for detail if they want it.
- **"Why is this project late?"**
  - **Answer like this:** "In brief, we're about two weeks behind, because the vendor's interface arrived late.
    We've won back one week by testing in parallel. The new date is 14 November. I'll tell you by Friday if that
    changes."
  - **Inappropriate:** "It's not our fault, the vendor was late." It sounds like blame and gives no plan. A long
    technical story before the date is just as bad.
  - **Why:** they need the answer, the plan and how confident you are, in that order.
- **"Can we go live next month?"** (and you are not sure)
  - **Answer like this:** "I don't want to commit today without checking two things: the UAT results and the security
    review date. I'll come back to you with a clear yes or no, and any conditions, by Thursday."
  - **Inappropriate:** "Should be fine." Or "No way, it's impossible." Both are guesses that someone will plan on.
  - **Why:** a date you give senior management becomes a promise to other people.
- **"Why didn't you tell me earlier?"**
  - **Answer like this:** "You're right, I should have flagged it on Monday, when I first saw the risk. From now on
    I'll raise a risk the day I see it, even before I have the full picture."
  - **Inappropriate:** "I was waiting for more information." Or "Nobody told me." Excuses keep the conversation on you.
  - **Why:** owning it in one sentence, plus what you will do differently, ends the topic.
- **"That number doesn't sound right."** (and you did check it)
  - **Answer like this:** "I checked it against the dashboard this morning: it's 200 GB. I'm happy to send you the
    screenshot." If you did not check it: "Let me double-check and confirm by this afternoon."
  - **Inappropriate:** backing down at once when you did check it, or arguing in front of the room.
  - **Why:** calm evidence is respectful and firm at the same time.
- **"Whose fault is this?"**
  - **Answer like this:** "The cause was a certificate renewal that was missed. It's my system now, so I've set up
    reminders 30 days ahead. I can walk you through the timeline if that helps."
  - **Inappropriate:** naming a colleague or the previous owner in the meeting.
  - **Why:** management wants to know it won't happen again. Blaming someone in public costs you trust too.
- **"What do you think we should do?"** (a decision above your level)
  - **Answer like this:** "From the technical side, I'd recommend option B, because it avoids the database change. The
    cost and contract side is for [owner] to weigh, but I'm happy to give input."
  - **Inappropriate:** "It's not my decision." Or a firm view on things you don't own, as if you did.
  - **Why:** give a clear view inside your area, and name who owns the rest.
- **"Can you explain this?"** in a big meeting, about something you took over recently
  - **Answer like this:** "I took this over three weeks ago, so let me tell you what I've confirmed and what I'm still
    checking."
  - **Inappropriate:** "Sorry, I'm new, I don't know", said every time.
  - **Why:** mention being new once, as context, then give what you have.

### Scenarios: your manager
- **"How's the handover going?"**
  - **Answer like this:** "About 60% through. I can now release to UAT on my own. Still open: the payment interface
    and the month-end job. One blocker: I'm still waiting for production log access. Could you help push that?"
  - **Inappropriate:** "All good", when it isn't. A problem your manager hears about late becomes their problem too.
  - **Why:** progress, what is open, and one specific ask.
- **"Can you take this on as well?"** (and you are already full)
  - **Answer like this:** "Yes, I can take it on, but I'll need to reprioritise. Should I hold the report work, or push
    the access review to next week?"
  - **Inappropriate:** a silent yes and then a missed deadline, or a flat "I'm too busy."
  - **Why:** you show you are willing, and let your manager choose the trade-off.
- **"Why did this take so long?"**
  - **Answer like this:** "Two reasons: I underestimated the testing, and the access request took a week. Next time
    I'll request access on day one and add a buffer for testing."
  - **Inappropriate:** a long defence, or "It just did."
  - **Why:** a short cause and a lesson shows you are learning.

### Scenarios: business users and the product owner
- **"When will this be fixed?"**
  - **Answer like this:** "Sorry this is holding you up. We've found the cause and we're testing a fix now. I'll update
    you by 4 pm today, whether or not it's done."
  - **Inappropriate:** "Soon." Or a technical explanation of the database lock.
  - **Why:** they need to plan their day. A time for the next update helps, even without a fix date.
- **"Can you just add this small change?"**
  - **Answer like this:** "I can see why that would help. Let me check the impact and come back with an estimate by
    Wednesday. Changes go through [product owner] for priority, so I'll include them."
  - **Inappropriate:** "Sure, easy." (It rarely is.) Or "That's out of scope", with nothing else.
  - **Why:** it respects both the request and the process.
- **"The system is always slow!"**
  - **Answer like this:** "That's frustrating, sorry. Could you tell me when it last happened and which screen you
    were on? That helps me find it in the logs."
  - **Inappropriate:** "It's fast for me." Or "That's the network, not us."
  - **Why:** one real example turns a complaint into something you can fix.
- **"Why do we have to do it this way?"** (a rule you did not make)
  - **Answer like this:** "It's because of the data-protection rules: we must keep a record of who changed what. If
    it's causing real problems, I can raise it with [owner]."
  - **Inappropriate:** "Those are the rules." Or criticising the rule yourself.
  - **Why:** explaining the reason gets cooperation; criticising the rule undermines it.

### Scenarios: vendors and partners
- **"Can you confirm sign-off today?"**
  - **Answer like this:** "I need to check with [owner] and the testers first. You'll have our answer in writing by
    Friday."
  - **Inappropriate:** a spoken "Yes, no problem." A vendor may treat it as agreement.
  - **Why:** you can't commit the organisation on your own.
- **"The problem is on your side."**
  - **Answer like this:** "Could you send the request ID and the time you're looking at? We'll check our logs for the
    same request and get back to you today."
  - **Inappropriate:** "No, it's on your side", with no evidence.
  - **Why:** evidence settles it faster than an argument.
- **"What's your budget for this?"**
  - **Answer like this:** "That's handled by [procurement]. I'll connect you with them."
  - **Inappropriate:** sharing budget figures, internal timelines, or your opinion of other vendors.
  - **Why:** what you tell a vendor can shape the contract. During an open tender, don't discuss it at all: refer them
    to the published tender channel.

### Scenarios: auditors, security and compliance
- **"Who has access to production?"**
  - **Answer like this:** "I'll pull the current access list and send it to you by tomorrow, with the date of the last
    review."
  - **Inappropriate:** "Only three people, I think." An answer from memory can end up in an audit report.
  - **Why:** auditors need evidence, not memory.
- **"Has there ever been a data breach?"**
  - **Answer like this:** "None in my time on the system. I'll check the incident records from before I joined and
    confirm in writing by [date]."
  - **Inappropriate:** "No, never." You can't know that for the years before you joined.
  - **Why:** say exactly what you know, and for which period.
- **"Why wasn't this control followed?"**
  - **Answer like this:** "I don't know yet. I'll find out what happened and come back to you with the facts by
    [date]."
  - **Inappropriate:** guessing at reasons, or "Everyone does it this way."
  - **Why:** answer only what was asked, with facts. Opinions can become findings.

### Scenarios: other teams
- **"Your system broke ours!"**
  - **Answer like this:** "Let's look at it together. Can you send me the time and the request ID? I'll check our side
    now."
  - **Inappropriate:** "Our system is fine."
  - **Why:** looking together is faster, and you keep the relationship.
- **"Can you just give us access to your database?"**
  - **Answer like this:** "I'll need to check the approval process for that. Could you send me what you need and why?
    I'll take it to [owner]."
  - **Inappropriate:** a quick yes to be helpful.
  - **Why:** access goes through approval, even for friendly teams.

### What not to say, by audience
| Audience | Inappropriate | Instead |
|---|---|---|
| Senior management | Jargon; a long backstory before the answer; blame; "We'll try our best" with no date | The bottom line first, then the plan and the date |
| Your manager | "All good" when it isn't; surprises at the deadline | Progress, what is open, and what you need |
| Business users | Technical detail; "soon"; blaming another team | The impact, the next step, and when they will hear back |
| Vendors and partners | Spoken commitments; budgets; your views on other vendors | "I'll confirm in writing by [date]." |
| Auditors and security | Guesses; opinions; "everyone does it"; more than was asked | Facts and records, in writing |
| Other teams | "Not my problem"; "our system is fine" | "Let's look at it together." |
| Anyone, in writing | Anything you would not want forwarded | Facts, a calm tone and a clear next step |

### When you got it wrong
It will happen. What matters is how fast and how cleanly you fix it.
- **Correct it as soon as you know**, before they find out on their own.
- Keep it short: what you said, what is right, how you know, and whether it changes anything for them.
- One "sorry" is enough. Don't over-explain.
- Example: "A correction to what I said this morning: the upload limit is 10 MB, not 20 MB. I checked the
  configuration. Sorry for the confusion. Does that change anything on your side?"
- A quick correction shows that your "sure" can be trusted. That is worth more than having been right the first time.

### Keeping your promises
- Write down every "I'll get back to you": who, what, and by when. Keep them in one place, such as your task list.
- If you can't make the time, send a short update before it passes: "Still checking with the vendor. I'll have it
  by Monday noon."
- An on-time reply that says "here's what I found, and here's what's still open" builds more trust than a perfect
  answer that comes late.

### Written replies
- **Holding reply, the same day:** "Hi [name], thanks for the question. I don't have the exact figure yet. I'm
  checking with the database team and will reply by 3 pm tomorrow."
- **The full answer:** "Hi [name], following up on yesterday: the database is about 200 GB and grows about 15 GB a
  month. The database team confirmed it from the monitoring dashboard [link]. One thing is still open, the archive
  job; I'll update you on that by Friday."
- **A correction:** "Hi [name], a correction to my earlier message: the limit is 10 MB, not 20 MB. I've checked the
  configuration. Sorry for the confusion. Let me know if it affects your plan."

### Before a meeting
- Guess the questions. The ones you would ask in a handover (areas A to M) are the ones others will ask you. Pick the
  five most likely for this meeting.
- Prepare a three-line answer for each: the answer, how you know, and where it can be seen.
- Know who to ask for what (L1). "I'll check with Mei Ling" sounds solid when you already know the name.
- Bring your notes. Reading a number from your notes is better than remembering it wrong.

### Practice
- Read the phrases in the tables aloud until they feel like your own words. Change the wording to suit how you speak.
- Practise with someone: they ask hard questions from areas A to M, and you answer with the answer ladder. Then swap.
- After a real meeting, note one question you handled badly, and write the answer you wish you had given.

## The questions

### A. The big picture: purpose and users

**A1 ★ "In plain words, what does this system do, and for whom?"**
- *Means:* the business purpose, before any technology.
- *Good answer:* "It lets small businesses apply for a trade permit online. About 2,000 applicants a month and
  40 officers use it. Before it, everything was on paper."
- *If vague, ask:* "Could you describe one real user and what they do with it on a normal day?"

**A2 ★ "Who uses it — the public, internal staff, other systems — and roughly how many?"**
- *Means:* the user groups and the scale. *Public-facing* means anyone on the internet can reach it;
  *internal* means only staff or other systems inside the organisation's network.
- *Good answer:* "Applicants use the public website, about 500 a day. Forty officers use an internal admin
  portal. Two partner systems call our API, about 10,000 calls a day."
- *If vague, ask:* "Where do those numbers come from? Is there a dashboard?"

**A3 "What does the business lose if it stops for an hour? For a day?"**
- *Means:* how critical the system is. This tells you how careful every change must be.
- *Good answer:* "An hour: applicants try again later, little harm. A day: permits miss a legal deadline and
  the call centre gets about 300 calls. It is rated 'critical' in the organisation's list of IT services."
- *If vague, ask:* "Has it ever stopped? What happened then?"

**A4 "Are there promised service levels: availability, response time, support hours?"**
- *Means:* an *SLA* (service level agreement) is a written promise, for example "available 99.5% of the month,
  urgent faults fixed within 4 hours".
- *Good answer:* "99.5% monthly availability, support 8 am to 8 pm on working days, and the most urgent faults
  (P1) fixed within 4 hours. It is in annex B of the contract, and we report it monthly."
- *If vague, ask:* "Is that written down anywhere, and is it measured?"

**A5 "Who are the main stakeholders, and who decides what gets built next?"**
- *Means:* the people who own the business need, approve changes and pay for the system.
- *Good answer:* "The product owner in Licensing sets priorities. IT Security signs off every release. The
  vendor manager handles the contract."
- *If vague, ask:* "Who approved the last change?"

**A6 "When are the busiest times — of the day, the week, the year?"**
- *Means:* the peaks. Failures hurt most then, and you avoid releases then.
- *Good answer:* "Mondays 9 to 11 am, and the last week of each quarter when renewals are due. That week has
  about five times the normal traffic."
- *If vague, ask:* "Which day had the most traffic last year?"

**A7 "What is changing soon: new users, new features, a move to new servers, an end-of-support date?"**
- *Means:* events already planned that you will inherit.
- *Good answer:* "A second agency joins in March. The framework version loses support in June. The vendor
  contract renews in September."
- *If vague, ask:* "What is on the plan for the next six months?"

**A8 "Which qualities matter most here: speed, accuracy, availability or security?"**
- *Means:* the *quality goals*: what "good" means for this system. They decide every trade-off in the design.
- *Good answer:* "Accuracy comes first: a wrong fee is worse than a slow page. Then availability during office
  hours. Speed matters least, as long as a page opens in a few seconds."
- *If vague, ask:* "If we had to trade speed against accuracy, which would the business choose?"

**A9 "How do we know the system is succeeding? Are there targets or KPIs?"**
- *Means:* *KPIs* (key performance indicators) are the numbers the business watches, such as "90% of
  applications decided within 5 days".
- *Good answer:* "90% decided within 5 working days, and fewer than 2% of applications returned for missing
  documents. Management sees both in a monthly report."
- *If vague, ask:* "What number would make the product owner worried?"

**A10 "Which rules limit our technical choices?"**
- *Means:* the *constraints*: rules you must follow, such as "only approved cloud providers" or "only these
  programming languages".
- *Good answer:* "All data must stay in-country. We may only use the approved hosting provider. New code must be
  in Java or TypeScript, the two languages the support team knows."
- *If vague, ask:* "Has a technical idea ever been refused because of a rule? Which rule?"

### B. Business rules and the domain

**B1 ★ "Which business terms confuse newcomers, and what do they mean here?"**
- *Means:* the *domain* vocabulary. The same word can mean something different in this organisation.
- *Good answer:* "'Application' is one request from one business. A 'case' is an application plus its
  documents. 'Lapsed' means no reply from the applicant within 30 days."
- *If vague, ask:* "Is there a glossary? Which words do new people mix up?"

**B2 ★ "Could you walk me through the main business process from start to finish, with one real example?"**
- *Means:* the end-to-end workflow. The *happy path* is the route when nothing goes wrong.
- *Good answer:* "The applicant submits the form, the system checks the documents, an officer reviews it within
  5 working days, approves or rejects it, the applicant gets an email, and the permit is valid for a year."
- *If vague, ask:* "Could we follow one real case through the system together?"

**B3 "Which rules matter most, or are most often misunderstood?"**
- *Means:* rules that cause wrong results when broken: fees, eligibility, deadlines, status changes.
- *Good answer:* "A lapsed permit can't be renewed, and the fee doubles after day 30. People get day 30 wrong
  because it counts working days, not calendar days."
- *If vague, ask:* "Which past bugs came from a rule being misread?"

**B4 "What happens in the unusual cases: duplicates, cancellations, corrections, errors?"**
- *Means:* *edge cases*, where most bugs live.
- *Good answer:* "A duplicate within 5 minutes is ignored. Cancelling after approval needs a supervisor.
  A correction creates a new version; nothing is overwritten."
- *If vague, ask:* "What happens if the same request arrives twice?"

**B5 "Where do the business rules live: code, configuration, database, another system, or people's heads?"**
- *Means:* rules often hide outside the code, in settings, database tables, other systems or manual steps.
- *Good answer:* "Fees are in a table the business edits. Eligibility is in code. The holiday calendar comes from
  the HR system. One approval is still done by email."
- *If vague, ask:* "If the fee changed tomorrow, what would someone have to edit?"

**B6 "Which laws, audits or policies does it have to follow?"**
- *Means:* *compliance*: data-protection law, audit trails, how long records must be kept.
- *Good answer:* "The personal-data protection act applies. Every officer action goes into an audit log kept for
  7 years, and internal audit reviews it once a year."
- *If vague, ask:* "Who is the data protection officer, and when did they last review this system?"

**B7 "Is there any behaviour nobody has decided yet, or that users keep complaining about?"**
- *Means:* open questions and known pain points. Don't "fix" these alone: they need a decision.
- *Good answer:* "Nobody has decided what to tell an applicant when the document check fails twice. Users
  complain that the status page doesn't refresh."
- *If vague, ask:* "What are the top three complaints from the service desk?"

**B8 "Does it deal with more than one time zone, language or currency?"**
- *Means:* times, dates, translations and money formats are a common source of bugs, for example at midnight
  or when daylight-saving time changes.
- *Good answer:* "One time zone and one currency. The site is in English and Malay; translations are in two
  resource files. All times are stored in UTC (world standard time) and shown in local time."
- *If vague, ask:* "What happens to a request submitted at 11:59 pm on a deadline day?"

**B9 "Where do the names in the code differ from the business names?"**
- *Means:* code often keeps old or developer names after the business renames things. The mismatch makes it hard
  to search the code, and hard to talk with users.
- *Good answer:* "The business says 'case'; the code says `Application`. An 'officer' is `Reviewer` in the code,
  from the first version. 'Lapsed' is the status `EXPIRED`. There is a table of these in the wiki."
- *If vague, ask:* "If a user reports a problem with a 'case', which class do I open?"

### C. How it works: architecture and main flows

**C1 ★ "Could you draw or show me the main parts and how they connect?"**
- *Means:* the *architecture*: the components and the links between them. Typical parts are a *front end*
  (the screens), an *API* (where programs send requests), a database, a *queue* and background *workers*.
- *Good answer:* "A web front end, one API, a PostgreSQL database, a message queue and two background workers.
  This diagram is from last month and is current, except the reporting service has been removed."
- *If vague, ask:* "Is there a diagram? Which parts of it are out of date?"

**C2 ★ "What happens, step by step, when a typical request comes in?"**
- *Means:* the runtime flow: one request followed through every part.
- *Good answer:* "The load balancer sends it to the API. The API checks the login, saves the record, puts a
  message on the queue and answers at once. A worker picks the message up within seconds, calls the payment
  service and emails the user."
- *If vague, ask:* "Could you show me in the code where each step happens?"

**C3 "What runs in the background or on a schedule, and how often?"**
- *Means:* work that happens with no user present: background workers, *batch jobs* and *scheduled jobs* (cron).
- *Good answer:* "A job at 2 am sends reminders. A worker checks the queue every 5 seconds. A monthly job
  archives old records."
- *If vague, ask:* "Does anything happen only at month-end or year-end?"

**C4 "Which technologies and versions does it use, and why were they chosen?"**
- *Means:* the *tech stack*: the programming language, the *framework* (the base the app is built on), the
  database and the main *libraries* (ready-made code it uses). Versions decide support and security.
- *Good answer:* "Java 17, the Spring Boot 3.2 framework, PostgreSQL 15, React 18 for the screens. We chose
  PostgreSQL over Oracle because it needs no licence and the cloud provider runs it for us. Spring Boot 3.2
  support ends next year. The versions are in `pom.xml` and `package.json`."
- *If vague, ask:* "Was another option considered, and why was it dropped?"

**C5 "Which design choices would surprise a newcomer, and why were they made?"**
- *Means:* decisions that look wrong but have a reason. Some teams write them down as decision records.
- *Good answer:* "Dates are stored as text because the partner sends them that way. We check the partner every
  few minutes instead of waiting for it to call us, because their system can't call out."
- *If vague, ask:* "Are the big decisions written down anywhere?"

**C6 "What would you redesign if you started again?"**
- *Means:* known weaknesses in the design (*technical debt* at the architecture level).
- *Good answer:* "The single database is a bottleneck: reports slow everyone down. I would move reporting to
  its own copy."
- *If vague, ask:* "Which part causes the most work or the most incidents?"

**C7 "Who uses which screens, on which browsers or devices, and are there accessibility rules?"**
- *Means:* the user interface. *Accessibility* means people with disabilities can use it, for example with a
  screen reader; it is often required by law for public services.
- *Good answer:* "Applicants use the public site on phones and desktops; we support the last two versions of
  Chrome, Edge and Safari. Officers use the admin portal on desktop only. Public pages must meet the WCAG 2.1 AA
  accessibility standard, checked once a year."
- *If vague, ask:* "Which browsers do the users actually have? Is there usage data?"

**C8 "When work goes through a queue, can a message arrive twice, out of order, or not at all? Where do failed
messages go?"**
- *Means:* the *delivery guarantees* of a queue. Most queues deliver *at least once*, so the same message can
  arrive twice. A *dead-letter queue* holds messages that failed too many times.
- *Good answer:* "At least once, so every worker checks the message ID first and skips repeats. Order is not
  guaranteed, so a worker never assumes the 'submitted' message came before 'paid'. After 5 failed tries a
  message goes to the dead-letter queue, and an alert fires. We empty it by hand with the replay script in the
  operations folder."
- *If vague, ask:* "What happens if the worker crashes halfway through one message?"

**C9 "For each main kind of data, which system is the source of truth?"**
- *Means:* the *source of truth* is the one system whose copy wins when two copies disagree. Other systems hold
  copies, and copies go out of date.
- *Good answer:* "Permits: our database. Staff names and roles: the HR system, and we hold a copy refreshed
  nightly. Payments: the bank; our 'paid' flag is only a copy, and the monthly reconciliation fixes any
  mismatch."
- *If vague, ask:* "If our copy and the other system's copy disagree, which one is right, and who fixes the
  other?"

**C10 ★ "What does one database transaction cover? If the save works but the next step fails, what happens?"**
- *Means:* a *transaction* is a group of database changes that all succeed or all fail together. Trouble starts
  at a step outside it: a queue message, an email, a call to another system. A crash between the two can lose
  work or do it twice.
- *Good answer:* "Saving an application and its documents is one transaction. The queue message is written to
  an *outbox* table in the same transaction, and a job sends it a second later, so a crash can't lose it. The
  bank call is outside any transaction: if it fails, the payment stays 'pending' and the retry job picks it up."
- *If vague, ask:* "If the server crashed between saving the record and sending the message, what would we find
  afterwards?"

**C11 "What is the overall design style, and which parts may call which?"**
- *Means:* the *architecture style*: one application (a *monolith*), several small services (*microservices*),
  or something between. *Dependency rules* say which module may use which. Breaking them slowly ruins the
  design, and nobody notices until a change touches everything.
- *Good answer:* "One application with four modules, deployed together. `web` may call `cases`, and `cases` may
  call `payments`, never the other way. A test in the build fails if someone breaks this rule."
- *If vague, ask:* "Has anyone broken that rule? What happened?"

### D. Integrations and dependencies

**D1 ★ "Which other systems does it talk to, in which direction, and how?"**
- *Means:* *integrations*. *Upstream* systems send to us, *downstream* systems receive from us. The method may
  be an API call, a file transfer, a queue or a shared database.
- *Good answer:* "We receive applications from the portal through its API. We send payments to the bank as a
  nightly file over SFTP (secure file transfer). We read staff data from a read-only view of the HR database."
- *If vague, ask:* "Is there a list of interfaces, with an owner for each?"

**D2 "Is there a written specification for each interface, and which version is live?"**
- *Means:* the agreed message format, often an OpenAPI document (a standard file that describes an API).
  Versions drift over time.
- *Good answer:* "Each has a spec in the shared drive. The bank interface is v2.3, signed off in May. The portal
  uses v1.4 of our API."
- *If vague, ask:* "If the partner changed a field tomorrow, how would we find out?"

**D3 "What happens when one of those systems is slow or down?"**
- *Means:* failure handling: *timeouts* (how long we wait), *retries* (trying again), queues that hold work,
  manual fallbacks.
- *Good answer:* "If the bank is down, payments wait in a queue and retry every 15 minutes for 24 hours, then
  support is alerted. If HR is down, logins still work from a cached copy."
- *If vague, ask:* "When did that last happen, and what did users see?"

**D4 "Who do I contact on the other side of each interface?"**
- *Means:* the owners of the other systems. You will need them in every incident and every change.
- *Good answer:* "The bank's integration desk, by ticket. The portal team's on-call phone. Both are listed in the
  support wiki."
- *If vague, ask:* "Could you introduce me to them before you leave?"

**D5 "Which outside services, paid libraries or vendors do we depend on? Are any near end of support or
renewal?"**
- *Means:* external dependencies and their risks.
- *Good answer:* "An address-lookup service on a yearly licence renewing in March, a paid PDF library, and an old
  reporting tool that is out of support."
- *If vague, ask:* "Where is the list of licences and renewal dates?"

**D6 "Who calls our API, and how do we change it without breaking them?"**
- *Means:* *backward compatibility*: an old caller still works after a change. *Deprecation* means you announce
  that something will be removed, and when.
- *Good answer:* "Two partner systems and our own front end. We only add fields; we never rename or remove one
  inside a version. A breaking change goes into a new version, /v2, and /v1 stays for six months after we email
  both partners. The contract tests in the pipeline fail if a field disappears."
- *If vague, ask:* "When did we last change the API, and did any caller break?"

### E. Data

**E1 ★ "What data does it keep, and which of it is personal or sensitive?"**
- *Means:* the kinds of data: customer details, transactions, documents, logs. *Personal data* identifies a
  person. What counts as *sensitive* depends on your law and policy, so check its definition with the data
  protection officer. Organisations also label data with a *classification* such as "Confidential".
- *Good answer:* "Applicant names, ID numbers, addresses and uploaded documents, which are personal. Permit
  records. Payment references, but no card numbers. Classified 'Confidential'."
- *If vague, ask:* "Could we look at the main tables together?"

**E2 ★ "How much data is there, and how fast is it growing?"**
- *Means:* the volume (rows, gigabytes) and growth rate. They drive storage, backup time and speed.
- *Good answer:* "About 200 GB and 2 million applications, growing about 15 GB a month, mostly uploaded
  documents in file storage."
- *If vague, ask:* "Where can I check the database size myself?"

**E3 "Which database or storage technology holds it, and where does it run?"**
- *Means:* the *backend engine*, for example PostgreSQL, Oracle, MySQL, SQL Server or MongoDB, plus where files
  are kept.
- *Good answer:* "PostgreSQL 15 as a *managed service* (the cloud provider runs it for us) with one standby copy.
  Documents are in *object storage* (cloud storage for files). Login sessions are in a shared cache."
- *If vague, ask:* "Which version, and who looks after it?"

**E4 ★ "How is it backed up, and has anyone tested a restore?"**
- *Means:* a *backup* is a copy; a *restore* gets it back. Untested backups often fail. *RPO* is how much recent
  data you can afford to lose; *RTO* is how long recovery may take.
- *Good answer:* "Full backups nightly, plus changes every 15 minutes, kept 35 days. We restored into an
  isolated recovery environment in July; it took 2 hours. RPO 15 minutes, RTO 4 hours."
- *If vague, ask:* "When was the last restore test, and is there a record of it?"

**E5 "How long is data kept, and how is old data deleted or archived?"**
- *Means:* the *retention* policy, set by law and by storage cost.
- *Good answer:* "Applications are kept 7 years by law, then a yearly job deletes them. Logs are kept 90 days."
- *If vague, ask:* "Does anything ever get deleted? Is that automatic or manual?"

**E6 "Where does the data go after it leaves this system: reports, other systems, exports?"**
- *Means:* downstream data flows: reports, a *data warehouse*, analytics, manual exports.
- *Good answer:* "A nightly extract to the data warehouse, a monthly Excel report to management, and CSV files
  (simple spreadsheet text files) that partners download."
- *If vague, ask:* "Who would complain first if an export stopped?"

**E7 "Are there known data-quality issues, or places where data gets corrected by hand?"**
- *Means:* wrong or messy data, and manual fixes, which are risky.
- *Good answer:* "About 300 old records have no postcode. Support runs a script every month to merge duplicate
  accounts; it is in the operations folder."
- *If vague, ask:* "When did someone last change data directly in the database?"

**E8 "How are changes to the database structure made and released?"**
- *Means:* the *schema* is the table structure; *database migrations* are the scripts that change it.
- *Good answer:* "Migration scripts live in the code repository. They run automatically in test. In production
  a DBA (database administrator) runs them before the new version starts."
- *If vague, ask:* "Could you show me the last migration and how it went out?"

**E9 "Did any data come over from an older system, and was anything converted badly or left behind?"**
- *Means:* the *data migration* history. Old records often break rules that new ones follow.
- *Good answer:* "Records before 2021 came from the old desktop system. Their addresses are free text, and
  about 1,000 have no document attached. The old system is switched off, but its last backup is kept."
- *If vague, ask:* "Is there anything different about the oldest records?"

### F. Infrastructure, environments and deployment

**F1 ★ "Where does it run — cloud, our own data centre, servers, containers — and how many of each?"**
- *Means:* the *infrastructure*. *On-premise* means our own data centre. A *VM* is a virtual server; a
  *container* packages the app with what it needs (for example Docker); *Kubernetes* runs many containers.
- *Good answer:* "In production, two Linux virtual servers behind a load balancer in our data centre, plus the
  database *cluster* (a group of database servers). Test and UAT have one server each."
- *If vague, ask:* "Is there a list or diagram of the servers?"

**F2 ★ "Which environments exist, and how do they differ from production?"**
- *Means:* the copies of the system: development, *SIT* (system integration testing), *UAT* (user acceptance
  testing, where the business tries it), *staging* (a near-copy of production) and production. Differences
  between them cause "it worked in test".
- *Good answer:* "Dev, SIT, UAT and production. UAT has a smaller database and a fake payment service. Only
  production talks to the real bank."
- *If vague, ask:* "What has worked in UAT and then failed in production?"

**F3 ★ "How do we release a new version, step by step, and how long does it take?"**
- *Means:* the deployment process. *CI/CD* is an automated *pipeline* that builds, tests and releases.
- *Good answer:* "When a change is merged into the main *branch*, the pipeline *builds* (turns the code into a
  runnable package) and tests it, and it goes to UAT automatically. After sign-off, the release manager releases
  it to production on Tuesday evenings. About 30 minutes."
- *If vague, ask:* "Could I watch the next release?"

**F4 ★ "How do we undo a bad release?"**
- *Means:* *rollback*, going back to the last working version. It is harder when the database changed, because
  restoring a backup would also lose every transaction made since the release.
- *Good answer:* "Redeploy the previous build from the pipeline, about 10 minutes. We write database changes so
  the old version still works with them. When one can't be undone that way, we fix forward with a quick
  follow-up release instead of restoring a backup."
- *If vague, ask:* "When did we last roll back, and how did it go?"

**F5 "Where are the settings kept, and where are secrets such as passwords and keys stored?"**
- *Means:* *configuration* is the settings for each environment. *Secrets* should sit in a *secret store*
  (also called a vault or key vault), never in the code.
- *Good answer:* "Settings come from *environment variables* (values the server gives the app at start-up), set
  by the pipeline. Secrets are in the cloud key vault, and only the release manager can read the production ones."
- *If vague, ask:* "Are any passwords in the code repository or in shared documents?"

**F6 "Is the infrastructure described in code, or was it set up by hand?"**
- *Means:* *infrastructure as code* (for example Terraform) can be rebuilt the same way every time. Hand-built
  servers are hard to rebuild.
- *Good answer:* "The cloud parts are Terraform in the infra repository. The on-premise servers were built by hand
  from a checklist in the wiki."
- *If vague, ask:* "If a server died tonight, how would we build a new one?"

**F7 "Who owns and patches the servers, the operating system and the database?"**
- *Means:* who is responsible for what: the app team, the infrastructure team, the DBA, a vendor. The *runtime*
  is the software the app needs to run, such as Java.
- *Good answer:* "The infrastructure team patches the operating system monthly. The DBA team owns the database.
  We own the application and its runtime."
- *If vague, ask:* "Who was called the last time a server had a problem?"

**F8 "Do you know roughly what it costs to run, and which budget covers hosting and licences?"**
- *Means:* running costs and licences, so a renewal or a bill is not a surprise.
- *Good answer:* "About 3,000 dollars a month for hosting, charged to Licensing. Two licences renew in March."
- *If vague, ask:* "Who receives the bill?"

**F9 "Where does test data come from, how often are the test environments refreshed, and is real personal data
ever copied into test?"**
- *Means:* test data, and whether copies of production are *masked* (personal details replaced with fake ones).
- *Good answer:* "Test data is generated by a script. UAT is refreshed from production every quarter, with names
  and ID numbers masked first. Unmasked production data never leaves production."
- *If vague, ask:* "Could I see what a customer record looks like in UAT?"

### G. Network and access paths

**G1 ★ "Can it be reached from the internet, or only inside the organisation's network?"**
- *Means:* public-facing or internal. This sets the security needs.
- *Good answer:* "The applicant site is public, through the organisation's internet entry point. The admin
  portal and the API are only on the internal network."
- *If vague, ask:* "Could I reach the admin portal from home?"

**G2 "What path does a request take to reach the application?"**
- *Means:* the hops. *DNS* turns a name into an address. A *load balancer* spreads requests across servers.
  A *reverse proxy* is a front door that forwards requests. A *firewall* blocks unwanted traffic; a *WAF* is a
  firewall that understands web requests. A *port* is a numbered door on a server.
- *Good answer:* "permits.example.org, then DNS, then the WAF, then the load balancer, then two app servers on
  port 8080."
- *If vague, ask:* "Is there a network diagram, and who owns each hop?"

**G3 "Where does HTTPS end, where are the certificates, and when do they expire?"**
- *Means:* encryption in transit (TLS/HTTPS) often ends at the load balancer. A *certificate* proves a server's
  identity and has an expiry date; an expired one breaks every connection that uses it, often the whole site.
- *Good answer:* "HTTPS ends at the load balancer. The certificate expires on 14 March. The infrastructure team
  renews it and gets a reminder 30 days ahead."
- *If vague, ask:* "Has a certificate ever expired by surprise?"

**G4 "Which outbound connections does it make, and do they need firewall openings or allow-lists?"**
- *Means:* calls our system makes to others. An *allow-list* is a list of permitted *IP addresses* (the
  numbers that identify machines on a network). Changes often need a request to another team, with a waiting
  time.
- *Good answer:* "Calls to the bank need a firewall rule, and the bank allow-lists our two public IP addresses.
  A change takes about 2 weeks through a network request."
- *If vague, ask:* "What would we need to do if a server got a new address?"

**G5 "If several servers run the app, does a user have to stay on the same one?"**
- *Means:* *sticky sessions*. If a login or a session lives in one server's memory, the load balancer must keep
  sending that user to the same server, or the user is logged out.
- *Good answer:* "No: sessions are in a shared cache, so any server can answer. We tested by switching one server
  off."
- *If vague, ask:* "What happens to logged-in users when one server restarts?"

### H. Security and compliance

**H1 ★ "How do people and other systems log in, and how are permissions decided?"**
- *Means:* *authentication* (proving who you are: password, single sign-on, a *token*, which is a temporary
  digital pass) and *authorisation* (what you are allowed to do, usually by role).
- *Good answer:* "Staff use the company single sign-on. Applicants use the national login. Partner systems get a
  token with their *client credentials* (a system's own ID and password). Roles are officer, supervisor and admin."
- *If vague, ask:* "Could you show me where roles are checked?"

**H2 "Which security checks are done, and what did the last one find?"**
- *Means:* automatic scans of code and libraries, and *penetration tests* (hired testers who try to break in).
- *Good answer:* "Code and library scans run in every build. A penetration test runs yearly; the last one in May
  found two medium issues. One is fixed; one is accepted until the upgrade."
- *If vague, ask:* "Where is the last report, and which findings are still open?"

**H3 "How are security patches and library updates handled?"**
- *Means:* keeping the software's parts up to date.
- *Good answer:* "A tool opens update requests automatically every week. Policy says critical patches within
  7 days."
- *If vague, ask:* "When were the libraries last updated?"

**H4 "What is recorded for audit, and who reviews it?"**
- *Means:* the *audit trail*: who did what, and when.
- *Good answer:* "Every officer action with the user, the time, and the values before and after. Kept 7 years.
  Internal audit samples it each quarter."
- *If vague, ask:* "If someone changed a fee by mistake, could we tell who and when?"

**H5 "Have there been any security incidents or near misses I should know about, and what changed as a result?"**
- *Means:* past security problems, and the rules or checks they led to.
- *Good answer:* "Two years ago a wrong export setting exposed test data. Since then every export needs two
  approvals."
- *If vague, ask:* "Was there a written review afterwards?"

**H6 ★ "Which passwords, keys or partner credentials expire, and who renews them?"**
- *Means:* besides certificates, many secrets expire: service-account passwords, API keys, partner tokens. A
  missed renewal looks like a sudden outage.
- *Good answer:* "The bank API key expires every 12 months, next in August; the database service password must
  change every 90 days. Both are in the shared calendar, and the release manager renews them."
- *If vague, ask:* "Is there a calendar of everything that expires?"

**H7 "Who adds and removes users and roles, and are access rights reviewed?"**
- *Means:* account administration: who grants access, who removes it when someone leaves, and the regular check
  that only the right people still have it.
- *Good answer:* "The service desk adds officers after their manager approves. HR leavers are removed
  automatically overnight. Supervisors review the role list every six months."
- *If vague, ask:* "When was the last access review, and what did it remove?"

**H8 "Is stored data encrypted, and who manages the keys?"**
- *Means:* *encryption at rest* protects data on disks and in backups if someone steals them. The *keys* that
  unlock it need an owner, a safe place, and a date for replacing them (*key rotation*).
- *Good answer:* "The cloud provider encrypts the database disks and backups. ID numbers are also encrypted
  column by column in the application. The keys are in the cloud key service. The security team owns them and
  rotates them every year, and only the application's service account can use them."
- *If vague, ask:* "Could someone with a copy of last night's backup read the ID numbers?"

**H9 "Where are the trust boundaries, and where is input checked?"**
- *Means:* a *threat model* lists who might attack, how, and what stops them. A *trust boundary* is where data
  arrives from someone you don't control: a user, a partner, an uploaded file. Input must be checked there
  (*input validation*).
- *Good answer:* "There is a threat model from last year's security review. It names three boundaries: the
  public form, partner API calls and uploaded files. Every request is checked against the OpenAPI file. Uploads
  are virus-scanned and must be PDF or JPG. Nothing a partner sends is trusted for fees."
- *If vague, ask:* "What happens if someone uploads a file that is not really a PDF?"

### I. Performance and capacity

**I1 ★ "How many requests or transactions does it handle on a normal day, and at peak?"**
- *Means:* the load, or *throughput*: requests per second, minute or day.
- *Good answer:* "About 12,000 requests a day, which is under 1 a second on average, but up to 20 a second at
  the Monday 9 am peak. That is from the monitoring dashboard."
- *If vague, ask:* "Could I see the traffic graph for the last quarter-end?"

**I2 ★ "How fast does it respond, and is there a target?"**
- *Means:* response time (*latency*). "p95 is 300 ms" means 95% of requests take less than 300 milliseconds
  (0.3 seconds).
- *Good answer:* "p95 is 300 ms for normal pages and 2 seconds for search. The target is under 1 second for
  pages."
- *If vague, ask:* "Which page do users complain is slow?"

**I3 ★ "What breaks first under heavy load, and what hard limits are there: sizes, batches, timeouts?"**
- *Means:* the *bottleneck* (the first thing to run out) and hard limits such as maximum upload size, batch
  size, number of database connections and timeouts.
- *Good answer:* "Database connections run out first, at 50. Uploads are limited to 10 MB. The partner gives up
  after 30 seconds. A batch over 1,000 records fails."
- *If vague, ask:* "Has it ever slowed down? What was the cause?"

**I4 "Has anyone run a load test, and what did it show?"**
- *Means:* a test that imitates many users at once.
- *Good answer:* "Last October, up to 150 requests a second. It held, but the database server's processor (CPU)
  reached 85%. The results are in the test folder."
- *If vague, ask:* "What is the most traffic we are confident it can take?"

**I5 "How does it grow when demand grows?"**
- *Means:* *scaling out* (more servers) or *scaling up* (a bigger server). Some parts can only run once, such as
  a scheduler, and some keep state in memory.
- *Good answer:* "The API scales out: add a server behind the load balancer. The scheduler must run on one
  server only. The database can only scale up."
- *If vague, ask:* "What would we do if traffic doubled next month?"

**I6 "Is anything cached, and what happens when the cache is wrong or empty?"**
- *Means:* a *cache* keeps a fast temporary copy. Out-of-date cached data is a classic bug.
- *Good answer:* "Reference data is cached for 10 minutes. After a restart the first requests are slower. We
  clear the cache after every fee change."
- *If vague, ask:* "How would I clear it if the data looked wrong?"

**I7 "Which database queries are slowest, and which indexes matter most?"**
- *Means:* slow queries are the most common cause of a slow page. An *index* makes one kind of search fast. A
  missing index makes that search slow, and too many indexes slow down saving. An ORM can also send one query
  per row without telling you (the *N+1 problem*).
- *Good answer:* "The officer search is slowest, about 2 seconds, because it searches free text. The index on
  applicant ID matters most: when it was dropped once, every page slowed down. The dashboard lists the 10
  slowest queries each week. Last year we found one N+1 problem, in the documents list."
- *If vague, ask:* "Where can I see the slowest queries right now?"

### J. Reliability, monitoring and support

**J1 ★ "How do we know it is healthy right now? Which dashboards and alerts exist?"**
- *Means:* *monitoring*: graphs of traffic, errors and speed (*metrics*), *logs*, *health checks* (an address
  that answers "I'm OK"), and *alerts* that notify people.
- *Good answer:* "A dashboard shows traffic, errors and response times. When errors pass 1% for 5 minutes, an
  alert goes to the support channel."
- *If vague, ask:* "Could you show me the dashboard now?"

**J2 ★ "Who gets called when it breaks, day and night, and how?"**
- *Means:* the support model. *L1* takes the call, *L2* investigates, *L3* fixes the code. *On-call* means
  someone is reachable after hours.
- *Good answer:* "The service desk takes calls (L1). Our team handles L2 in office hours. The vendor is L3.
  After hours the on-call phone rotates weekly."
- *If vague, ask:* "Who was called the last time it broke at night?"

**J3 ★ "What were the last few incidents, and what did we learn?"**
- *Means:* the incident history. A *postmortem* is a written review of what went wrong and what changed.
- *Good answer:* "March: an expired certificate, 2 hours down; now we have reminders. June: a slow database query
  after a schema change; now we test queries before each release."
- *If vague, ask:* "Where are the incident reports kept?"

**J4 "Where are the logs, how long are they kept, and how do I search them?"**
- *Means:* logs are the system's diary of events. A *request ID* is a label that ties together every log line
  of one request.
- *Good answer:* "Logs go to the central log platform for 30 days; search by request ID. Older logs are archived
  for a year."
- *If vague, ask:* "Could you show me how you found the cause of the last incident in the logs?"

**J5 "Are there step-by-step guides for common problems?"**
- *Means:* *runbooks*: instructions for a known task or failure.
- *Good answer:* "Yes, in the operations wiki: restarting the worker, re-sending failed payments, replacing the
  certificate."
- *If vague, ask:* "Which problem do you fix most often, and where are the steps?"

**J6 "What does someone do by hand regularly — daily, monthly, yearly?"**
- *Means:* work that is not automated and will become yours.
- *Good answer:* "Monthly: run the duplicate-merge script and send the usage report. Yearly: load the new
  holiday calendar and renew the certificate."
- *If vague, ask:* "What did you do by hand last month?"

**J7 "What is the plan if a whole site is lost, or data is corrupted or deleted by mistake? Has it been tested?"**
- *Means:* *disaster recovery*. *Failover* means switching to a standby copy. A standby copies mistakes and
  *ransomware* (malware that locks or encrypts data) too, so it doesn't protect against corruption; separate
  backups do.
- *Good answer:* "A standby site has a copy of the database; failover is manual with a 4-hour target, tested in a
  drill in January. Against corruption or ransomware we keep 35 days of backups that can't be changed."
- *If vague, ask:* "What would we do if someone deleted a table by mistake this afternoon?"

**J8 "How would we know if a scheduled job didn't run, or only half finished?"**
- *Means:* background jobs can fail silently, with no user to notice.
- *Good answer:* "Each job writes a 'finished' record, and an alert fires if the nightly job hasn't finished by
  6 am. A half-finished job resumes from its last checkpoint."
- *If vague, ask:* "When did a job last fail, and how did we find out?"

**J9 "Which alerts can wait until morning, and which mean drop everything?"**
- *Means:* alert priority. Too many noisy alerts teach people to ignore the important ones.
- *Good answer:* "'Payments failing' and 'site down' mean act now, day or night. 'Disk 80% full' and 'slow
  search' can wait for office hours. About two alerts a week are noise; we are tuning them."
- *If vague, ask:* "Which alert would you never ignore?"

**J10 "If it's down for a day, how do users keep working, and who tells them?"**
- *Means:* *business continuity*: the manual fallback and the communication plan.
- *Good answer:* "Officers switch to paper forms kept at each counter, and the service desk posts a notice on the
  website. The product owner decides when to tell the public."
- *If vague, ask:* "When did that last happen?"

**J11 "How do users get help, and is there training or a user guide?"**
- *Means:* user support and documentation for the people who use the system, not the people who build it.
- *Good answer:* "Applicants have an online help page and a hotline. Officers get a 1-hour training session and a
  user guide in the intranet; it was updated in March."
- *If vague, ask:* "Where do user questions go, and who answers them?"

### K. Code, testing and the way of working

**K1 ★ "Where is the code, and how do I build and run it on my own machine?"**
- *Means:* the *repository* (repo), where the code and its history live, and the steps to get it running.
- *Good answer:* "Two repositories: the app and the infrastructure. The README has the steps. You need Docker and
  Java 17. The first build takes about 10 minutes."
- *If vague, ask:* "Could we do the setup together now?"

**K2 ★ "Which tests exist, how long do they take, and what is not tested?"**
- *Means:* *unit* tests check small pieces, *integration* tests check parts working together, *end-to-end*
  tests check the whole flow. Untested areas are where your changes are riskiest.
- *Good answer:* "800 unit tests in 2 minutes. 60 integration tests need Docker and take 10 minutes. The payment
  flow has no automated test; it is checked by hand."
- *If vague, ask:* "If I changed the fee rule, which test would fail?"

**K3 "How does a change go from idea to production: tickets, branches, reviews, approvals?"**
- *Means:* the team's workflow. A *branch* is a separate line of changes; a *pull request* asks others to review
  a branch before it is *merged* (joined) into the main code.
- *Good answer:* "A ticket, then a branch, then a pull request with one reviewer. The pipeline must pass, the
  product owner signs off in UAT, and it goes out in the Tuesday release."
- *If vague, ask:* "Could you walk me through the last change that went live?"

**K4 "Which parts of the code are risky to change, and where is a safe place to start?"**
- *Means:* fragile areas, and good first tasks for a newcomer.
- *Good answer:* "Don't change the fee calculator without the business. The reports module is a safe place for
  your first tickets."
- *If vague, ask:* "Which file has caused the most bugs?"

**K5 "Which documents can I trust, and which are out of date?"**
- *Means:* documentation drifts; knowing which parts are stale saves you from wrong turns.
- *Good answer:* "The README and the wiki are current. The architecture document is from 2023 and doesn't show
  the queue."
- *If vague, ask:* "When was each document last updated?"

**K6 "What are the coding rules and conventions, including rules on AI tools?"**
- *Means:* style rules, *commit* message rules (a commit is one saved change in the repository), and whether AI
  coding assistants may be used, on what, and how that is recorded.
- *Good answer:* "A *linter* enforces the style. Commit messages start with the ticket number. AI assistants are
  allowed on this code, but not on client data, and the reviewer must be told."
- *If vague, ask:* "Is there a written guide? Who enforces it?"

**K7 "Which known bugs and technical debt are open?"**
- *Means:* *technical debt* is past shortcuts that make change harder now.
- *Good answer:* "40 open bugs, 5 of them high. The main debt is the old framework version and the untested
  payment flow. They all carry the 'tech-debt' label in the tracker."
- *If vague, ask:* "Which three would you fix first?"

**K8 "Is there a change board, a freeze period or a maintenance window, and how are users told about downtime?"**
- *Means:* *change control*. A *change board* (CAB) approves production changes. A *freeze* is a period with no
  releases. A *maintenance window* is the agreed time for planned downtime.
- *Good answer:* "Production changes go to the weekly change board on Thursdays. There is no release in the last
  two weeks of December. Planned downtime is Sunday 2 to 4 am, announced on the website three days ahead."
- *If vague, ask:* "What happened with the last urgent change?"

**K9 ★ "How is the code organised: which folder or module does what, and where does a request enter the code?"**
- *Means:* the *code map*: the main *modules* (groups of code with one job) and the *entry point* where a request
  first reaches the code.
- *Good answer:* "Four modules: `web` holds the API controllers, `cases` holds the business rules, `payments`
  talks to the bank, and `jobs` holds the scheduled work. A request enters at a controller in `web`, calls a
  service in `cases`, and the service saves through a data-access class. Nothing in `web` talks to the database
  directly."
- *If vague, ask:* "Could you open the code and follow one request from the controller to the database with me?"

**K10 ★ "Which few tables or classes are the heart of the system, and how does a record's status change?"**
- *Means:* the *core domain model*: the main things the system works on. The *status lifecycle* is the list of
  statuses a record can have, and which moves between them are allowed.
- *Good answer:* "Three: Application, Document and Permit. An application goes Draft → Submitted → Under review →
  Approved or Rejected; Lapsed is reached only from Submitted. The allowed moves are in one class,
  `ApplicationStatus`, and the database refuses any other."
- *If vague, ask:* "Is there a diagram of the statuses? Which move causes the most bugs?"

**K11 "How does the code handle errors: how they are raised, what the user sees, and what is logged?"**
- *Means:* the *error-handling* rules, so every part reacts to a failure the same way.
- *Good answer:* "Business errors, like a missing document, become a 400 reply with a message the user can read.
  Anything unexpected becomes a 500 reply with a request ID, and the full details go to the log, never to the
  user. One handler class does this for the whole API."
- *If vague, ask:* "Could you show me what the log says when the payment call fails?"

**K12 "What happens if two people change the same record at the same time, or one action runs twice?"**
- *Means:* *concurrency* (actions at the same time) and *idempotency* (doing an action twice has the same effect
  as doing it once). Bugs here are rare and hard to reproduce.
- *Good answer:* "Each record has a version number. If two officers save at once, the second one gets 'this case
  changed, please reload'. Payment calls carry a key, so the bank ignores a repeat. A double-click on Submit
  caused duplicate applications last year; that is now blocked."
- *If vague, ask:* "Has anyone seen duplicate or lost changes? What caused them?"

**K13 "Which feature flags or settings switch behaviour on or off, and which are no longer used?"**
- *Means:* a *feature flag* is a switch that turns code on or off without a new release. Old flags pile up and
  make the code hard to read.
- *Good answer:* "Six flags, in the settings table. `new-fee-calculator` is on in UAT only. `legacy-upload` has
  been off for a year and can be removed. Only the release manager changes flags in production, and each change
  is logged."
- *If vague, ask:* "If I wanted to switch a feature off in production tonight, how would I do it?"

**K14 "What are the logging rules in the code, and how do I add a new metric or alert?"**
- *Means:* *observability in code*: what each part must log, how log lines are tied together by the request ID,
  and how numbers reach the dashboard.
- *Good answer:* "Log in JSON, at INFO for business events and ERROR for failures, never with ID numbers or
  names. The request ID is added to every line automatically. A new metric is one line with the metrics
  library; it shows on the dashboard within a minute."
- *If vague, ask:* "Could you show me one log line and what each field means?"

**K15 "How do I reproduce a production bug on my own machine?"**
- *Means:* local debugging. It needs test data that looks real and *stubs* (fake versions) of the partner
  systems.
- *Good answer:* "Run the app in Docker with the `local` profile. The bank and the HR system are replaced by
  stubs in the `stubs` folder. Load the sample cases with the seed script. For a real case, take the request ID
  from the log and replay its masked input with the replay tool."
- *If vague, ask:* "How did you reproduce the last bug you fixed?"

**K16 "Where does the code do things that you can't see by following the calls?"**
- *Means:* frameworks run code for you. *Filters* and *interceptors* run before or after every request.
  *Dependency injection* connects classes automatically. An *ORM* (a tool that maps tables to classes) may load
  data only when it is first used. Some code is *generated* at build time. A request's path "jumps" at these
  places.
- *Good answer:* "Three places. A filter checks the login before every controller. An interceptor writes the
  audit log after every save. The API classes are generated from the OpenAPI file at build time, in
  `target/generated`; never edit them by hand."
- *If vague, ask:* "If I stop the program at the first line of the controller, what has already run before it?"

**K17 "Which past changes best explain the design, and which files change most often?"**
- *Means:* the repository's *history*: commits, pull requests and their discussions. It shows why the code looks
  as it does. Files that change often are where the work and the bugs gather.
- *Good answer:* "Read pull request 214, where we moved payments onto the queue; its discussion explains the
  outbox. `FeeCalculator` changes almost every release, so it has the most tests. The history of the `cases`
  module tells the story of the status rules."
- *If vague, ask:* "If you had to pick three pull requests for me to read, which ones would they be?"

### L. People, money and the handover itself

**L1 ★ "After you leave, who should I go to for what?"**
- *Means:* the map of people: business, infrastructure, database, vendor, and other teams.
- *Good answer:* "Business questions: the product owner. Servers: the platform team. Database: the DBA. Vendor
  issues: their account manager. I'll introduce you to each of them this week."
- *If vague, ask:* "Could you introduce me to each of them before you go?"

**L2 ★ "Which access do I need, and how do I request it?"**
- *Means:* the accounts and permissions you need to do the job.
- *Good answer:* "The code repositories, the pipeline, read-only production logs, the test database and the
  ticket system. Request them in the IT portal; production access also needs your manager's approval."
- *If vague, ask:* "Which access took longest for you to get?"

**L3 "Which contracts, licences, vendors or support agreements should I know about?"**
- *Means:* paid agreements and their limits and dates.
- *Good answer:* "The vendor maintenance contract ends in December and includes 4 support hours a month. Two
  software licences renew in March."
- *If vague, ask:* "Where are the contracts, and who manages them?"

**L4 "Which deadlines or promises have already been made?"**
- *Means:* commitments you inherit.
- *Good answer:* "A release is due on 15 May, an audit is in June, and we promised the business a new report by
  the third quarter."
- *If vague, ask:* "What has the business been told to expect?"

**L5 ★ "What would you do first in my place, and what should I never touch without asking?"**
- *Means:* priorities and danger zones, from the person who knows.
- *Good answer:* "Learn the release process first. Never run the year-end job without someone from the business
  present."
- *If vague, ask:* "What mistake did you make early on that I could avoid?"

**L6 ★ "What do you know that isn't written down anywhere?"**
- *Means:* knowledge that exists only in people's heads. This is the most valuable part of a handover.
- *Good answer:* "The partner's API is slow on the first Monday of each month because of their own batch run.
  The business accepts a manual retry. That isn't documented anywhere."
- *If vague, ask:* "What do people usually call you about?"

**L7 "Would it be all right to contact you with questions after the handover? What works best, and for roughly
how long?"**
- *Means:* a safety net for what you missed.
- *Good answer:* "Email me for the next month, and let's book a 30-minute check-in in two weeks."
- *If vague, ask:* "Could we put a 30-minute check-in in the calendar now, for about two weeks from today?"

**L8 ★ "Is anything running under your own accounts — scheduled jobs, API keys, cloud subscriptions, licences,
or alert emails?"**
- *Means:* things tied to the leaver's personal accounts stop working when those accounts are closed.
- *Good answer:* "The monthly report job runs under my user, and the alert emails go to my mailbox. Let's move
  both to the team account this week."
- *If vague, ask:* "What would stop working if your account were closed tomorrow?"

**L9 "Who owns the code, and do any licences put obligations on us?"**
- *Means:* *intellectual property*: whether the organisation or a vendor owns the code; *escrow* (a third party
  holds the vendor's code in case the vendor disappears); and *open-source licences*, some of which require you
  to share changes.
- *Good answer:* "We own the code under the contract. The vendor's PDF component is in escrow. All open-source
  libraries are on permissive licences; the scan report is in the repository."
- *If vague, ask:* "Has the legal or procurement team reviewed it?"

**L10 ★ "How will we both know I'm ready? Could I do a release and handle an incident while you watch?"**
- *Means:* the handover's finish line, agreed up front.
- *Good answer:* "When you have done one release, fixed one ticket and handled one support call with me watching,
  and the access list is complete. Let's aim for the end of next week."
- *If vague, ask:* "What would you need to see to be comfortable leaving?"

**L11 "Where is the project now: its phase, its backlog, its risks, and who is on the team?"**
- *Means:* the *project state*, not the system state. It covers what is being built now, what is waiting (the
  *backlog*), the open risks (the *risk log*), and the people. You join a project in motion, not only a finished
  system.
- *Good answer:* "We are in phase 2 of 3, adding renewals. The backlog has 60 tickets, and the top 10 are agreed
  for this quarter. The risk log has three open risks; the biggest is the vendor contract ending in December.
  The team is two developers, one tester, a part-time DBA and the product owner."
- *If vague, ask:* "Where are the backlog and the risk log, and who updates them?"

### M. AI and language models

Skip this area if the system uses no AI model. A model does not always give the same output for the same input,
so the questions on testing and failure matter more than they do for normal code. In the sample answers, the
permit system uses an AI model to summarise each application for the officer and to draft the decision letter.

**M1 ★ "Which AI models does it use, for which step, which version, and where do they run?"**
- *Means:* the *model inventory*. An *LLM* (large language model) writes text. A model can run on our own
  servers or be called from a provider over the internet. Versions matter, because the same model name can
  behave differently after an update.
- *Good answer:* "One LLM, from the approved cloud provider, pinned to version 2026-06. It writes the officer
  summary and the draft letter. A small model on our own server checks the language of each upload. The
  provider retires our version next March."
- *If vague, ask:* "Which file or setting names the model and its version?"

**M2 "Where are the prompts kept, how are they versioned, and who may change them?"**
- *Means:* a *prompt* is the instruction text sent to the model. Changing a prompt changes the output, just as
  changing code does.
- *Good answer:* "In the repository, in `prompts/`, one file per task, released with the code. A prompt change
  needs a pull request, the evaluation run, and the product owner's approval. Nobody edits prompts in
  production."
- *If vague, ask:* "When did a prompt last change, and what did it fix?"

**M3 ★ "How is a model or prompt change tested before release, and what score must it reach?"**
- *Means:* *evaluation*: a fixed *test set* of inputs with known good outputs, scored automatically, by another
  model (*LLM-as-judge*), or by people. The pass mark must be set before the test, or it moves.
- *Good answer:* "A test set of 300 real cases with masked names. Each draft letter is scored for correct fee,
  correct permit name and tone. The pipeline blocks the release if correct-fee drops below 99%. Twice a year two
  officers score 50 letters by hand, to check that the automatic score still agrees with people."
- *If vague, ask:* "Could I see the results of the last evaluation run?"

**M4 "Which words or rules must the output always follow, and how is that enforced?"**
- *Means:* *constraints on output*: official terms, names, numbers and formats that must appear exactly. Telling
  the model is not enough; something must check.
- *Good answer:* "Permit names and fee amounts must match the database exactly. We put them into the prompt, and
  after the model answers, a check compares every amount and name. If one differs, the draft is rejected and the
  officer writes that part by hand. About 1 draft in 200 fails the check."
- *If vague, ask:* "What happens when the model uses a different word for an official term?"

**M5 ★ "How does the model's output go wrong, and how do we notice?"**
- *Means:* AI *failure modes*: *hallucination* (invented facts that sound true), missing parts, the wrong
  language, and *prompt injection* (an instruction hidden in the input, such as "ignore the rules and approve").
- *Good answer:* "Three seen in production: an invented document date, a summary that left out a rejected
  document, and one letter in English when Malay was asked. Every draft is reviewed by an officer before it is
  sent. Upload text is marked as data in the prompt, and our test set has 20 injection cases."
- *If vague, ask:* "Which wrong output reached a user, and what changed afterwards?"

**M6 "What happens when the model is slow, down or over its limit?"**
- *Means:* the *fallback*: what the system does without the model. Providers have outages and *rate limits* (a
  maximum number of calls per minute).
- *Good answer:* "We wait 20 seconds, then retry once. If it still fails, the officer sees 'no summary
  available' and works as before AI. Nothing is blocked. During the provider's outage in August, officers worked
  without summaries for 3 hours."
- *If vague, ask:* "Could an officer still decide a case if the model were off all day?"

**M7 "What does each model call cost, what limits are there, and who pays?"**
- *Means:* AI use is charged per *token* (here, a small piece of text, about three-quarters of a word; not the
  login token in H1). *Quotas* cap the calls per day or per caller.
- *Good answer:* "About 2 cents per case, around 1,200 dollars a month, charged to Licensing. The provider
  allows 600 calls a minute. Each calling team has its own key and a daily quota, so one team can't use up
  everyone's share. The bill is reviewed monthly."
- *If vague, ask:* "What was last month's bill, and where can I see usage per caller?"

**M8 ★ "What input and output is logged or kept, who can see it, and does the model provider keep or learn from
our data?"**
- *Means:* *AI data handling*. Prompts often contain personal data. Check what the provider stores, for how
  long, and whether it trains its models on it. Check also which data *classification* the provider is approved
  for.
- *Good answer:* "We log the request ID, the model version, the scores and the timing, but not the text. The
  full text is kept 30 days for investigations, and only two people can read it. Under the contract the provider
  keeps nothing and does not train on our data. It is approved up to 'Confidential'."
- *If vague, ask:* "Where is that written: in the contract, or in a security review?"

**M9 "How do we know the output quality in production, not only in testing?"**
- *Means:* *production monitoring of AI*: user feedback, regular samples checked by people, and changes over
  time. Inputs change, so quality can slip without any code change (*drift*).
- *Good answer:* "Officers mark each draft 'used', 'edited' or 'rewritten'. Last month 70% were used with small
  edits. If 'rewritten' rises above 15%, the product owner gets an alert. Each month 20 drafts are sampled and
  scored by hand."
- *If vague, ask:* "Which number would tell us quality got worse?"

**M10 "Who decides on a model or prompt change, and who must be told before it goes live?"**
- *Means:* *AI governance*. A model change can change results for every user, so it often needs more approval
  than a code change. It may also need a notice to users or partners.
- *Good answer:* "The product owner approves, after reading the evaluation results. IT Security reviews any new
  model or provider. Partner teams that use our drafts get two weeks' notice, with the old and new scores side
  by side."
- *If vague, ask:* "When was the last model change, and who signed it off?"

## Turning a generic question into a tailored one

Before a session, spend an hour in the code, the configuration and the documents. Then rewrite the generic
questions using what you found. A tailored question shows you did your homework, and it gets a precise answer.

You can let an AI agent read the code for you. This vault's `/codebase-onboarding` skill (it runs only when you
type it) builds a repo's runbook, and its part 5 is this bank tailored to that repo: every ★ question rewritten
with a fact from the code and what a good answer should contain. Its `kt_bank.py` reads this note, so keep the
question lines in the form `**A1 ★ "…"**`. Check K6 first: some organisations do not allow AI tools on their
code or their clients' code.

| Generic | What you found | Tailored |
|---|---|---|
| I3 "What hard limits are there?" | Each request is stored in a database column that holds 64 KB | "A request is stored in a column that holds 64 KB, and a test with 83 KB failed. What is the biggest request you have seen?" |
| G5 "Does a user have to stay on one server?" | Login tokens are kept in each server's memory, and there are two servers | "Tokens live in one server's memory. Does the load balancer keep each caller on the same server?" |
| E5 "How is old data deleted?" | No code ever deletes log rows | "I couldn't find anything that removes old log rows. Is there a cleanup outside the code, or do they grow forever?" |
| K5 "Which documents are out of date?" | The README says a command fails, but it works | "The README says a plain build fails, but it works for me. Which other parts of the README should I check?" |

## Glossary

| Term | In plain words |
|---|---|
| Accessibility | Making a system usable by people with disabilities |
| Allow-list | A list of addresses that are permitted to connect |
| API | A way for programs to call another program over the network |
| arc42 | A widely used template for documenting a software architecture |
| Architecture | The main parts of a system and how they connect |
| At-least-once delivery | A queue may deliver the same message more than once, but does not lose it |
| AWS Well-Architected | Amazon's checklist for good cloud systems: operations, security, reliability, speed, cost, sustainability |
| Audit trail | A record of who did what, and when |
| Authentication / authorisation | Proving who you are / what you are allowed to do |
| Backlog | The list of work waiting to be done, in priority order |
| Backup / restore | A copy of the data / getting it back from the copy |
| Backward compatibility | A change that old callers still work with |
| Batch job | A program that processes many records at once, often on a schedule |
| Bottleneck | The part that runs out of capacity first |
| Branch, merge | A separate line of code changes / joining it back into the main code |
| Build | Turning source code into a package that can run |
| Business continuity | How the business keeps working while a system is down |
| Cache | A fast, temporary copy of data |
| Change board (CAB) | A group that approves changes to production |
| Checkpoint | A saved point a job can restart from, so it need not start again |
| CI/CD, pipeline | Automatic build, test and release of new versions |
| Client credentials | A system's own ID and password, used to get a token |
| Cluster | A group of servers working as one |
| Commit | One saved change in the code repository |
| Compliance | Following laws, audits and policies |
| Concurrency | Two or more actions on the same data at the same time |
| Container, Docker | An app packaged with everything it needs to run |
| Contract test | A test that fails when an API's agreed message format changes |
| Controller | The class that first receives a web request and passes it on |
| CPU | The processor; "CPU at 85%" means the server is busy |
| Cron, scheduled job | A timetable that starts jobs automatically |
| CSV | A simple text file of rows and columns that spreadsheets open |
| Data classification | A label for how sensitive data is, such as "Confidential" |
| Data masking | Replacing personal details with fake ones in copied data |
| Data warehouse | A separate database that collects data for reports |
| Database view | A saved query that looks like a read-only table |
| DBA | Database administrator |
| Dead-letter queue | Where messages go after they fail too many times |
| Dependency injection | The framework connects each class to what it needs, instead of the code doing it |
| Dependency rule | A rule about which module may use which |
| Deprecation | Announcing that something will be removed, and when |
| Disaster recovery (DR) | The plan for recovering from losing a site or losing data |
| DNS | The service that turns a name into a network address |
| Domain | The business area and its vocabulary |
| Domain model | The main things a system works on, as tables or classes |
| Drift | A slow change away from what was agreed or tested: a spec, a setting, or the quality of a model's output |
| Edge case | An unusual situation the normal path does not cover |
| Encryption at rest | Encrypting stored data on disks and in backups |
| End of support (end-of-life) | The date after which a product gets no more fixes |
| Entry point | Where a request first reaches the code |
| Environment | One copy of the system: dev, SIT, UAT, staging, production |
| Environment variable | A setting the server gives the app when it starts |
| Escrow | A third party holds a vendor's code in case the vendor disappears |
| Evaluation, test set | Scoring a model's output / a fixed set of inputs with known good outputs |
| Failover | Switching to a standby copy when the main one fails |
| Feature flag | A switch that turns code on or off without a new release |
| Filter, interceptor | Code the framework runs before or after every request |
| Firewall, WAF | A filter that blocks unwanted network traffic; a WAF understands web requests |
| Framework | The base an application is built on, for example Spring Boot or .NET |
| Freeze period | A time when no releases are allowed |
| Front end / back end | The screens users see / the server side that does the work |
| Generated code | Code a tool writes at build time; never edit it by hand |
| Hallucination | Model output that sounds true but is invented |
| Happy path | The route through a process when nothing goes wrong |
| Health check | An address the app answers to say it is working |
| HTTP status code | A number in every web reply: 200 means OK, 400 means the request was wrong, 500 means the server failed |
| Idempotency | Doing an action twice has the same effect as doing it once |
| Incident, postmortem | An outage or failure / the written review afterwards |
| Index | A database structure that makes one kind of search fast |
| Infrastructure as code (IaC) | Servers and networks described in files, so they can be rebuilt |
| Input validation | Checking that incoming data has the expected form before using it |
| Integration | A connection between this system and another |
| Intranet, internal network | The organisation's private network, not reachable from the internet |
| ISO 25010 | An international list of what makes software good: speed, reliability, security, ease of use and more |
| IP address | The number that identifies a machine on a network |
| JSON | A common text format for structured data, used by APIs and logs |
| KB, MB, GB | Kilobyte, megabyte, gigabyte: about a thousand, a million and a billion bytes |
| Key rotation | Replacing an encryption key on a schedule |
| KPI | A number the business watches to judge success |
| Kubernetes | A platform that runs and manages many containers |
| L1 / L2 / L3 support | Takes the call / investigates / fixes the code |
| Latency, p95, ms | Response time / the time that 95% of requests beat / milliseconds |
| Library | Ready-made code that a program uses |
| Linter | A tool that checks code style automatically |
| Linux | A common server operating system |
| LLM | Large language model: an AI model that reads and writes text |
| LLM-as-judge | Using one AI model to score another model's output |
| Load balancer | Spreads incoming requests across several servers |
| Load test | A test that imitates many users at once |
| Maintenance window | The agreed time for planned downtime |
| Managed service | A service the provider runs for you, such as a cloud database |
| Microservice | A small service that is built and deployed on its own |
| Migration | Three meanings: a script that changes the database structure; moving data from an old system; moving the system to new infrastructure. Ask which one is meant |
| Module | A group of code with one job |
| Monitoring, metrics, logs, alerts | Watching the system / numbers over time / event records / automatic warnings |
| Monolith | One application deployed as a single unit |
| N+1 problem | Sending one database query per row instead of one query for all the rows |
| OAuth, OpenID Connect, SSO | A standard for giving an app limited access / the login layer built on it / one login for many systems |
| Object storage | Cloud storage for files |
| On-call | The person who must answer if something breaks after hours |
| On-premise | In the organisation's own data centre |
| Open-source licence | The terms for using free code; some require you to share your changes. *Permissive* licences (such as MIT or Apache) ask only for credit |
| OpenAPI | A standard file format that describes an API |
| ORM | A tool that maps database tables to classes in the code |
| Outbox | A table where messages are saved in the same transaction as the data, then sent by a job |
| P1 | The most urgent priority level for a fault |
| Penetration test | Hired testers who try to break in |
| Personal data | Data that identifies a person |
| Pinned version | A fixed version that changes only when someone changes it on purpose |
| Port | A numbered door on a server, for example 443 for HTTPS |
| Profile (configuration) | A named set of settings, for example one for your own machine |
| Prompt | The instruction text sent to an AI model |
| Prompt injection | An instruction hidden in the input that tries to change what the model does |
| Pull request | A proposed code change that others review before it is merged |
| Queue | A waiting line for work that is processed later |
| Quota, rate limit | The most calls allowed per day or per caller / per minute |
| Ransomware | Malware that locks or encrypts data and demands payment |
| README | The "read me first" file in a code repository |
| Reconciliation | Comparing two systems' records and fixing the differences |
| Repository (repo) | Where the code and its full history are stored |
| REST | A common style of web API that uses ordinary web addresses and methods |
| Retention | How long data is kept before it is deleted |
| Retry, timeout | Trying again after a failure / the longest time to wait |
| Request ID | A label that ties together every log line of one request |
| Reverse proxy | A front door that forwards requests to the app |
| Risk log | The list of open risks, each with an owner and a plan |
| Rollback, fix forward | Going back to the last working version / correcting with a new release instead |
| RPO / RTO | How much data you can lose / how long recovery may take |
| Runbook | Step-by-step instructions for a known task or failure |
| Runtime | The software an app needs to run, such as Java or .NET |
| Scale out / scale up | Add more servers / use a bigger server |
| Schema | The structure of the database tables |
| Secret, secret store | A password or key / a protected place to keep them |
| Seed script | A script that loads sample data into an empty database |
| Service account | An account used by a program, not a person |
| SFTP | A secure way to transfer files between servers |
| SIT | System integration testing: checking that the parts and partner systems work together |
| SLA | A written promise about availability, speed or support |
| SRE, production-readiness review | Site reliability engineering (Google's way of running systems) / its checklist before a system goes live |
| Snapshot | A point-in-time copy of a server or database |
| Source of truth | The one system whose copy wins when copies disagree |
| Staging | A test environment set up as close to production as possible |
| Stakeholder | Someone who owns, uses, approves or pays for the system |
| Standby | A ready copy of a server or database that can take over if the main one fails |
| Status lifecycle | The statuses a record can have, and the moves allowed between them |
| Sticky sessions | Keeping each user on the same server |
| Stub | A fake version of another system, used in tests and on your own machine |
| Tech stack | The languages, frameworks and databases a system uses |
| Technical debt | Past shortcuts that make change harder now |
| Terraform | A common tool for infrastructure as code |
| Threat model | A list of who might attack a system, how, and what stops them |
| Throughput | How much work is done per second, minute or day |
| TLS, HTTPS, certificate | Encryption for network traffic / the file that proves a server's identity |
| Token (login) | A temporary digital pass that proves you logged in |
| Token (AI) | A small piece of text, about three-quarters of a word; AI use is charged per token |
| Transaction | A group of database changes that all succeed or all fail together |
| Trust boundary | Where data arrives from someone you don't control |
| UAT | User acceptance testing: the business checks the system before release |
| Upstream / downstream | Systems that send to us / systems we send to |
| UTC | World standard time, used to store times without time-zone confusion |
| VM | A virtual server running on shared hardware |
| WCAG | The international accessibility standard for web pages; AA is the level most rules ask for |
| Wiki | A shared website where a team keeps its notes and guides |
| Worker | A background program that processes queued work |

## Notes table

Copy this for each session.

| Question | Answer, in their words | Where I can see it | Follow-up · owner · date |
|---|---|---|---|
| | | | |

## Related
- [[_MOC - Reference Materials]]
