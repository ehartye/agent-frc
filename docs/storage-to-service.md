# How many stored pieces reach the receiver?

A hopper holds twelve pieces. Your strategy needs seven handoffs in six seconds. Before changing the motor, identify where the next piece waits and what has to happen to free it.

## Follow the pieces through the loaded assembly

1. Start with the project’s saved robot revision, piece dimensions, initial poses, mechanism and controller states, and one clock. Assign an ID to every piece in the trial. Record which carriers are full at the start and their phase relative to the outlet.
2. Sweep the gate and carrier with neighboring pieces in place. Check openings at the narrowest point and the receiver pose at handoff. A piece wider than every opening rejects that route. A wider opening still needs a trial under load, including bridging, misalignment and contact.
3. At each interface record the upstream release condition, travel or dwell time, the downstream acceptance signal and the reset needed for the following piece. Include reverse strokes, empty carriers returning, shared actuators, occupied targets and controller inhibits. Test two consecutive IDs before using the observed spacing as a repeat interval. Test the full batch or bound supply and delays to claim a whole-window count.
4. Give each ID one location or disposition at the deadline, such as remaining in storage, in transit, received, lost or unresolved. Record any observed retention separately. An outlet crossing and a subsequent loss are two events for one ID. Check that the final counts sum to the starting IDs plus any distinct arrivals. A scoring claim additionally needs the target’s rule-qualified event on that same clock.

Use a small event table in the project experiment. These illustrative rows show why crossing the outlet is insufficient.

| Piece | Port crossing | Receiver acceptance | Next-piece interlock | At the 6 s deadline |
| --- | ---: | ---: | --- | --- |
| A | 0.25 s | 1.50 s | ready at 1.50 s | received |
| B | 1.75 s | no event | inhibited following loss | lost on transfer |
| C | no event | no event | waiting for recovery | still in storage |

## Put the limiting stage into the scoring window

Suppose all twelve pieces fit, but only seven have a path to the outlet; the other five remain behind a fixed guide. Assume the gate takes 0.25 s, the transfer 0.50 s, and the receiver takes 0.75 s to accept a piece and rearm. In this example each acceptance is observed at the end of that interval. The service window starts with the robot in position.

| Interface behavior | First acceptance | Next acceptance spacing | Conditional handoffs by 6.00 s |
| --- | ---: | ---: | ---: |
| One interlock serializes all three stages | 1.50 s | 1.50 s | 4 |
| Independent stages with room for a piece between stages | 1.50 s | 0.75 s | 7 |
| Fixed guide closes every loaded route | none | unknown | 0 |

For the overlapping case, record successive IDs at the gate, transfer and receiver to establish that all three really can operate together. The first handoff uses the whole 1.50 s. Six further handoffs at 0.75 s intervals reach the seventh exactly at the deadline. A jam, occupied target or late reset reduces that count. If the outlet geometry or handoff is untested, record the count as unknown and the table as a design target.

Check the return path for a circulating feeder. For example, three carriers on a 1.2 m loop moving at 0.6 m/s take 2 s per revolution. With at most one piece per carrier each revolution, the sustained ceiling is 1.5 pieces/s. Three adjacent loaded carriers spaced 0.12 m apart can pass the outlet 0.20 s apart at first. That burst lasts only until the gap in the loop arrives. Trace the initial carrier positions, reloads and revolutions against the actual deadline.

In the [scoring-window calculator](kickoff-field-lab.md), allocate the seven accessible IDs to this opportunity and retain twelve in the inventory. Use the actual transit and setup. A serial process can use the full 1.50 s cycle. To represent the overlapping example, enter a 0.75 s cycle plus 0.75 s extra setup for the first handoff. This adjustment applies when first latency is at least the established repeat interval. For irregular or jammed flow, use the timestamped events. Save the port-access basis, serial or overlapping assumptions, unserved IDs and limiting interface with the opportunity and carry the experiment link into the capability contract.
