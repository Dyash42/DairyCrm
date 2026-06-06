# Jharanai CRM — Product Requirements (extracted from docx)

Jharanai CRM & Sales Management App
Solution Steps – High-Level Overview
Rushikulya Agro Private Limited  |  Prepared: June 2026
1. Solution Overview
A WhatsApp-first CRM & Sales Management platform for Jharanai (dairy brand of Rushikulya Agro Pvt. Ltd.) that automates customer onboarding, subscription, pause/resume, route management, and last-mile delivery confirmation via QR scan – with a unified admin dashboard.
Key Modules
WhatsApp Bot – Customer-facing onboarding, subscription, pause, resume.
Jharanai Web App (Admin) – Routes, customers, sales executive assignment, dashboard.
Jharanai Mobile App (Sales Executive) – QR scan-based delivery confirmation.
Backend Services – Customer DB, subscription engine, payment, notifications, analytics.
2. Customer Onboarding Flow (WhatsApp)
Customer sends &apos;Hi&apos; to the Jharanai WhatsApp number.
Bot detects new number → triggers onboarding conversation.
Bot collects via guided prompts: Name, Address, Email, Alternative Number, Daily Milk Requirement (litres).
System creates Customer record and generates a Unique Customer ID.
System auto-generates a Unique QR Code linked to Customer ID.
Bot asks: &apos;How many litres do you want to subscribe for?&apos; → captures quantity (X).
System calculates amount (X × rate × days) → sends payment link.
On successful payment → activates subscription, sends QR code image + confirmation: &apos;X litres subscribed successfully.&apos;
3. Repeat Purchase Flow
Existing customer sends &apos;Hi&apos;.
Bot recognizes number → shows menu: Renew | Pause | Resume | Support.
Customer selects Renew → bot prompts: &apos;Select delivery days of the week.&apos;
System calculates total quantity for Y days and amount → sends payment link.
On payment success → updates schedule, sends confirmation message.
4. Pause Subscription Flow
Customer sends &apos;Hi&apos; → selects &apos;Pause&apos; from menu.
Bot prompts Start Date and End Date of pause.
System validates dates → updates delivery schedule (skip these days).
Confirmation: &apos;Your delivery is paused from <start> to <end>.&apos;
Auto-resume on End Date + 1, with a reminder message.
5. Jharanai Web App – Admin
5.1 Route Management
Admin creates Routes (Route name, area, pin codes).
Admin assigns Customers to a Route (drag-drop or bulk upload).
Admin assigns a Sales Executive to each Route.
Re-assignment supported – history maintained.
5.2 Customer Management
Search / filter customers by route, subscription status, area.
View QR code, subscription history, payment history, pause history.
6. Jharanai Mobile App – Sales Executive
Executive logs in → sees today&apos;s route with customer list (sequenced).
At each house → opens app → taps &apos;Scan QR&apos;.
Scans the customer&apos;s unique QR → screen shows scheduled litres (X).
Executive confirms &apos;Mark Delivered&apos; (option to edit if partial).
System logs delivery → triggers WhatsApp confirmation to the customer: &apos;X litres delivered today. Thank you.&apos;
Offline mode: queues scans and syncs when online.
7. Admin Dashboard
Real-time aggregate view for operational decisions.
View
Metrics
Today
Total litres delivered, customers served, pending, missed, by route
This Week
Trend by day, route-wise totals, top/bottom performing routes
This Month
Total revenue, subscription growth, churn, paused customers
By Route
Executive performance, delivery completion %, customer count
By Customer
Subscription value, delivery adherence, payment status
8. WhatsApp Messaging – Pricing Summary (India, 2026)
Jharanai&apos;s CRM relies heavily on WhatsApp utility messages (order confirmations, delivery alerts, pause/resume notifications). The pricing model below applies to Meta&apos;s WhatsApp Business Platform, effective January 2026.
8.1 Per-Message Rates (India)
Message Category
Meta Rate (per message)
Use Case for Jharanai
Utility
₹0.115 – ₹0.13
Order/subscription confirmation, delivery alerts, pause/resume confirmations, payment reminders
Authentication
₹0.115 – ₹0.13
OTP for customer verification (if used)
Marketing
₹0.8631
Promotional offers, new product launches (not part of core flow)
Service (free-form replies)
Free in 24-hr window
Replies to customer-initiated chats
8.2 The 24-Hour Customer Service Window (Key Cost Saver)
When a customer sends a message (e.g., &apos;Hi&apos;), a 24-hour service window opens.
Inside this window, ALL utility templates and free-form messages are FREE (since July 2025).
Every new inbound customer message resets the 24-hour timer.
Most Jharanai flows (onboarding, renewal, pause) start with the customer saying &apos;Hi&apos; – so these confirmations are FREE.
8.3 Which Jharanai Messages Get Charged?
Message Type
Category
Charged?
Onboarding confirmation (X litres subscribed)
Utility
FREE (customer-initiated)
Renewal confirmation
Utility
FREE (customer-initiated)
Pause confirmation
Utility
FREE (customer-initiated)
Auto-resume reminder (days later)
Utility
₹0.115 (business-initiated)
Daily delivery confirmation (X litres delivered)
Utility
₹0.115 (business-initiated)
Payment link inside active chat
Utility
FREE
Promotional / offers broadcast
Marketing
₹0.8631
8.4 Cost Projection – 1,000 Active Subscribers
Assumption: 1,000 active subscribers × 25 deliveries/month = 25,000 delivery confirmations.
Item
Calculation
Monthly Cost
Delivery confirmations
25,000 × ₹0.115
₹2,875
Onboarding / renewal / pause flows (customer-initiated)
Mostly free
₹0
Auto-resume reminders (~100/month)
100 × ₹0.115
₹11.50
Meta charges (subtotal)
~₹2,887
BSP platform markup (15–30%)
₹430 – ₹860
Estimated All-in Total
₹3,300 – ₹3,750
Per-customer cost: approximately ₹3.30 – ₹3.75 per subscriber per month – negligible vs. dairy subscription revenue.
8.5 Cost-Optimization Levers
Design flows to start with customer message (&apos;Hi&apos;) – keeps onboarding, renewal, pause FREE.
Encourage customer replies (e.g., &apos;Reply 1 to confirm delivery received&apos;) – opens free 24-hr windows.
Batch multiple notifications inside an open service window.
Select a low-markup BSP – AiSensy, Wati, Interakt, or Gupshup (markups 10–30%).
Use INR local billing (available Jan 2026) – removes FX risk.
9. Success Metrics
Onboarding completion rate (>85% of customers who say &apos;Hi&apos; complete onboarding).
Delivery confirmation rate (>98% via QR scan).
Subscription renewal rate (target >80%).
Reduction in manual coordination time for admin (>60%).
Customer satisfaction via WhatsApp feedback (>4.5/5).