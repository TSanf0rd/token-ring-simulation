# Token-Ring Mutual Exclusion — Data Replication Scheme

An interactive simulation of the **Data Replication Based Protocol** for token-ring mutual exclusion in mobile computing environments.

**Live Demo:** [https://TSanf0rd.github.io/token-ring-simulation/](https://TSanf0rd.github.io/token-ring-simulation/)

---

## Course Information

**CS 6604 — Mobile & Distributed Computing — HW 2**

### Contributors

- **Tyler Sanford**
- **Nooshin Pourtalebihoomadin**

---

## Concepts Simulated

This simulator demonstrates the **Data Replication Based Protocol** for achieving mutual exclusion among Mobile Hosts (MHs) in a mobile computing environment. The key concepts include:

### System Architecture

- **Mobile Support Stations (MSSs):** Five fixed base stations arranged in a logical ring. MSSs handle all heavy computation and token circulation on behalf of mobile hosts.
- **Mobile Hosts (MHs):** Eight mobile devices distributed across the MSS cells. MHs send requests to their local MSS and receive token grants through them.
- **Token:** A single token circulates around the logical ring of MSSs. Only the MH holding the token may enter the critical section.

### The Data Replication Protocol

The core idea is that instead of searching for a mobile host's location (which is expensive), every request is **replicated across all MSSs**. This way, whichever MSS currently has both the token and the requesting MH in its cell can serve the request directly — no location tracking needed.

The protocol operates in two phases:

- **Phase 1 — Broadcast & Temporary Priority:** When an MH sends a request `req(h, h_count)` to its local MSS, that MSS broadcasts the request to all other MSSs. Each MSS assigns a temporary priority (higher than all existing requests in its queue), tags the request as *undeliverable*, and sends the temporary priority back to the originating MSS.

- **Phase 2 — Final Priority Assignment:** The originating MSS collects all temporary priorities, computes the global maximum, and broadcasts that final priority to all MSSs. Every MSS updates the request to this final priority, marks it as *deliverable*, and re-sorts its delivery queue.

### Token Service and Cleanup

- When an MSS holds the token, it checks its queue for the highest-priority *deliverable* request where the MH is currently local to that MSS.
- If a match is found, the token is granted to that MH, which enters the **critical section**.
- If no local deliverable request exists, the token is passed to the next MSS in the ring.
- Upon release, the MSS broadcasts a `delete` message and all MSSs remove the completed request from their queues.

### Why This Approach Works

- **No location searching:** Every MSS already has a copy of every pending request, so the token can be delivered locally without searching the network.
- **Global ordering:** The two-phase priority protocol ensures all MSSs agree on the same request ordering, preventing conflicts.
- **Fairness:** The token circulates the ring, and each MH's request will eventually be served when the token reaches an MSS where that MH is local.

---

## How to Use the Simulator

### Ring View Tab

1. **Submit a request:** Click on any purple MH circle on the ring diagram. The MH will increment its `h_count`, send a request to its local MSS, and trigger the two-phase broadcast protocol. Watch the event log at the bottom to see each step unfold.

2. **Serve or pass the token:** Click the **"Serve / Pass Token"** button. If the token-holding MSS has a deliverable local request, it grants the token to the highest-priority MH (which enters the critical section and then releases). If no local request can be served, the token passes to the next MSS in the ring.

3. **Read the event log:** The color-coded log at the bottom shows every action: requests (red), broadcasts (purple), priority assignments (yellow), token movements (gold), grants (green), and releases (orange).

4. **Try multiple requests:** Submit several requests from different MHs before serving. This demonstrates how the priority ordering works across multiple pending requests and how the token serves them in order.

5. **Reset:** Click **"Reset"** to clear all state and start over.

### MSS Queues Tab

Switch to this tab to inspect the **delivery queue at every MSS**. Each queue entry shows:

- The requesting MH and whether it is local to that MSS
- The MH's `h_count` value
- The assigned priority number (temporary or final)
- The deliverable/undeliverable status

This tab directly satisfies the assignment requirements for showing request logs, priorities, and queue state after service.

### How It Works Tab

A detailed prose explanation of the entire Data Replication Based Protocol, useful as a study reference.

---

## Technology

The simulation is built as a single self-contained `index.html` file using React (loaded via CDN) with in-browser JSX compilation through Babel. No build step or server is required — it runs entirely in the browser.

---

## References

- Course lecture slides: *Distributed Algorithms versus Mobility* — Token-Ring Mutual Exclusion, Data Replication Scheme
