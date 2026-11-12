# Hardware shopping list

Builds the two devices in the approved scope: one High-Power Plug (1 outlet,
up to ~1,760 W) and one Power Strip (3 outlets, ≤150 W each).

Prices are rough estimates, not checked against live listings. Confirm on
Shopee/Lazada before budgeting. Expect about ₱4,000–5,500 for the parts,
tools not included.

## Electronics

| Part | Qty | Est. each | Notes |
|---|---|---|---|
| PZEM-004T **v3.0**, 100A, with **closed (solid-ring) CT** | 4 | ₱350–600 | 1 for the plug, 3 for the strip. Must say v3.0 (Modbus). Avoid the split/open clamp CT. |
| ESP32 DevKit V1 (ESP32-WROOM-32, 30 or 38 pin) | 2 (+1 spare) | ₱250–400 | Plus a **data-capable** micro-USB cable |
| HLK-PM01 isolated AC-DC module, 5 V 0.6 A | 2 | ₱150–250 | Powers each ESP32 from mains. Do not substitute a non-isolated supply. |
| Resistor assortment (needs 1 kΩ) | 1 pack | ₱50–100 | For the PZEM-to-ESP32 3.3 V signal fix |
| Female-female Dupont jumper wires | 1 pack | ₱50–80 | Low-voltage side only |

## Mains side

| Part | Qty | Est. each | Notes |
|---|---|---|---|
| Panel-mount fuse holder, 5×20 mm | 2 | ₱20–50 | One per device |
| Fuse 10 A slow-blow, 5×20 mm | 3 | ₱5–15 | Plug (spares included) |
| Fuse 5 A, 5×20 mm | 3 | ₱5–15 | Strip (spares included) |
| Outlet rated 15–16 A, 250 V | 1 | ₱80–200 | For the High-Power Plug. Branded (Panasonic, Royu, Omni). |
| Outlet, 10 A or higher, 250 V | 3 | ₱50–120 | For the strip |
| Heavy-duty plug, 15–16 A | 1 | ₱60–150 | Plug device input |
| Royal cord 3-core **2.0 mm² (14 AWG)** | 2 m | ₱60–90/m | Plug device input cord and internal mains wiring |
| Plug + cord, 1.25 mm² (16 AWG) | 1 | ₱100–200 | Strip input |
| Wago 221 lever connectors (or screw terminal blocks rated 20 A+) | 10 | ₱15–40 | No twisted-and-taped joints |
| ABS project enclosure, large enough for all parts | 2 | ₱200–400 | Plastic, with a screw-down lid |
| Cable glands / strain reliefs | 2–4 | ₱15–30 | Where cords enter the box |
| Heat-shrink tubing, standoffs, zip ties | — | ₱150 total | |

## Tools and safety (skip what you already have)

| Item | Est. | Why |
|---|---|---|
| Digital multimeter | ₱300–600 | Continuity checks before anything is ever plugged in |
| Plug-in watt meter (energy meter socket) | ₱300–500 | Reference for your accuracy validation |
| Portable RCD/ELCB adapter or an ELCB-protected extension | ₱400–900 | Cuts power on a leakage fault during testing |
| Soldering iron + solder, wire stripper, insulated screwdrivers | ₱500+ | |

## Before you buy

- The heavy plug carries about 8 A continuously. Every part in that current
  path (plug, cord, outlet, connectors, fuse holder) must be rated 10 A or
  more at 250 V. Cheap unbranded outlets are the usual weak point.
- Wiring diagrams, the build order, and the full safety checklist come with
  the firmware step. Do not connect anything to mains before then.
