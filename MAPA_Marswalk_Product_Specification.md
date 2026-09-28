# MAPA --- Marswalk Analysis & Planning Assistant

## Product Specification

**Project:** MAPA\
**Expanded name:** Marswalk Analysis & Planning Assistant\
**Challenge:** NASA Space Apps 2026 --- *Interplanetary Survival Guide:
Martian Map*\
**Product type:** Interactive Mars mapping, EVA planning, and science
decision-support platform\
**Primary user:** Future human Mars surface explorer / EVA crew\
**Core objective:** Transform NASA Mars datasets into an integrated map
that helps astronauts plan and conduct safer, scientifically valuable
Marswalks.

------------------------------------------------------------------------

## 1. Product Scope

MAPA should focus specifically on **human surface exploration during a
Marswalk (EVA)** rather than attempting to model an entire crewed Mars
mission.

The central product question is:

> **How should an astronaut safely and efficiently explore this part of
> Mars while maximizing scientific value?**

Rovers, habitats, landing sites, and previous robotic missions should
support this goal rather than become separate primary mission-planning
systems.

### Core User Journey

1.  **Explore** a region of Mars.
2.  Inspect NASA-derived environmental and scientific layers.
3.  Select a habitat/base or Marswalk starting point.
4.  Select a destination and scientific targets.
5.  Add optional waypoints.
6.  Generate a Marswalk route.
7.  Assess distance, elevation, slope, terrain, hazards, and scientific
    opportunities.
8.  Review the route before EVA.
9.  Enter a simplified EVA/navigation mode.
10. Visit science targets while monitoring traverse conditions.
11. Maintain a viable return route to the habitat/base.
12. Complete the Marswalk.

------------------------------------------------------------------------

# 2. Product Architecture

MAPA should use three primary modes:

## 2.1 Explore

A GIS-style interactive Mars map for investigating the Martian surface.

### Functions

-   Pan, zoom, and rotate the Mars map.
-   Search for known Martian locations.
-   Display latitude and longitude.
-   Click any point to inspect the location.
-   Enable and disable NASA data layers.
-   Adjust layer opacity.
-   View NASA mission information.
-   Display previous rover traverses.
-   Identify potential scientific targets.
-   Set a location as a Marswalk starting point.
-   Set a location as a destination.
-   Add a location as a science waypoint.

------------------------------------------------------------------------

## 2.2 Plan Marswalk

The main mission-planning workspace.

### Functions

-   Select starting location/base.
-   Select destination.
-   Add multiple waypoints.
-   Mark science stops.
-   Generate a proposed traverse.
-   Compare route alternatives.
-   Calculate route distance.
-   Estimate traverse duration.
-   Calculate elevation gain/loss.
-   Calculate maximum and average slope.
-   Identify hazardous terrain.
-   Display terrain difficulty.
-   Display a route elevation profile.
-   Highlight scientific opportunities near the route.
-   Calculate estimated detour distance/time for optional science
    targets.
-   Display return-to-base information.
-   Review the complete Marswalk before beginning EVA.

------------------------------------------------------------------------

## 2.3 EVA Mode

A simplified interface intended to represent information available
during the Marswalk.

The EVA interface should prioritize readability and avoid displaying
unnecessary GIS controls.

### Primary Information

-   Current position.
-   Planned route.
-   Direction of travel.
-   Next waypoint.
-   Distance to next waypoint.
-   Distance to base.
-   Estimated traverse time.
-   Estimated return time.
-   Nearby science targets.
-   Terrain/hazard alerts.
-   Route deviations.
-   Return route.

### Primary Actions

-   **Next Waypoint**
-   **Science**
-   **Route**
-   **Return to Base**

------------------------------------------------------------------------

# 3. Marswalk Route Planner

The Marswalk Route Planner should be MAPA's flagship functionality.

### Input

The user defines:

**Base / Start → Waypoints → Science Targets → Destination → Return**

### Route Evaluation Variables

Where suitable NASA data are available, MAPA should evaluate:

-   Horizontal distance.
-   Elevation.
-   Elevation gain/loss.
-   Terrain slope.
-   Terrain roughness.
-   Geological features.
-   Known terrain hazards.
-   Scientific targets.
-   Distance from base.
-   Estimated walking time.

MAPA should not present an unsupported physiological or life-support
calculation as scientifically precise. Any operational estimates should
clearly state the assumptions and datasets used.

### Example Route Summary

``` text
MARSWALK #014

Habitat → Delta Outcrop → Crater Rim → Habitat

Total Traverse:       6.4 km
Estimated Duration:   3 h 48 min
Elevation Gain:       162 m
Maximum Slope:        14.7°
Science Targets:      3
Terrain Difficulty:   Moderate
Estimated Return:     16:42 LMST
```

### Route Visualization

The route should appear directly on the Mars map with distinct markers
for:

-   Start/base.
-   Destination.
-   Waypoints.
-   Science stops.
-   Hazard areas.
-   Current position.
-   Return path.

------------------------------------------------------------------------

# 4. NASA Data Layer System

The challenge specifically emphasizes a **layered, integrated view**
using data from multiple NASA science missions.

MAPA should therefore treat the layer system as a central feature rather
than a visual accessory.

## 4.1 Base Layers

### Surface Imagery

Provides visual context for the Martian terrain.

Potential sources may include orbital imagery products from NASA Mars
missions.

### Elevation

Use Mars topographic/elevation data such as **MOLA** where appropriate.

Uses:

-   Terrain visualization.
-   Elevation profile.
-   Elevation gain/loss.
-   Slope derivation.
-   Route assessment.

### Slope

Derived from suitable elevation data.

Uses:

-   Identify steep terrain.
-   Route planning.
-   Hazard identification.
-   Traverse difficulty assessment.

------------------------------------------------------------------------

## 4.2 Safety and Terrain Layers

Potential layers include:

-   Terrain slope.
-   Terrain roughness.
-   Craters.
-   Major terrain obstacles.
-   Surface temperature, where relevant data are available.
-   Thermal properties.
-   Dust-related information, where scientifically supportable.
-   Communication/line-of-sight information if the team implements an
    appropriate model.

The interface should distinguish between **directly observed NASA data**
and **MAPA-derived products**.

For example:

> **Slope --- MAPA Derived Layer**\
> Calculated from MOLA elevation data.

------------------------------------------------------------------------

## 4.3 Science Layers

Potential science layers include:

-   Geological units.
-   Mineralogy.
-   Hydrated mineral observations.
-   Water/ice indicators.
-   Thermal observations.
-   Surface composition.
-   Interesting geological formations.
-   Previous observations.
-   Known science targets.

These layers should help answer:

> **What locations are scientifically valuable enough to justify
> visiting during the Marswalk?**

------------------------------------------------------------------------

# 5. Site Analysis Tool

Clicking a point on Mars should open a contextual site-analysis card.

### Example

``` text
SITE ANALYSIS
18.437°N, 77.503°E

TERRAIN
Elevation:           -2,418 m
Slope:               7.4°
Traverse Difficulty: Moderate

SCIENCE
Geological Unit:     Delta deposit
Mineral Observation: Clay-bearing
Hydration Evidence:  Detected

HAZARDS
Steep terrain approximately 320 m east

[ADD WAYPOINT]
[ADD SCIENCE STOP]
[ROUTE HERE]
```

Values should only be displayed when supported by the underlying
dataset.

The site card should also identify the source dataset.

------------------------------------------------------------------------

# 6. Terrain and Elevation Profile

After generating a route, MAPA should display an elevation profile
underneath or alongside the map.

### Example

``` text
Elevation

-2.1 km                     /\
                           /  \
-2.3 km          /---------    \---
            -----/

             0     1     2     3     4 km
             H     S     !     S     H
```

Legend:

-   `H` --- Habitat/base.
-   `S` --- Science target.
-   `!` --- Hazard or difficult terrain.

### Functionality

Hovering over the elevation profile should highlight the corresponding
position on the map.

The profile may display:

-   Distance.
-   Elevation.
-   Slope.
-   Waypoints.
-   Science targets.
-   Hazardous sections.

------------------------------------------------------------------------

# 7. Science Opportunity System

MAPA should help astronauts discover useful scientific targets rather
than requiring every destination to be manually selected beforehand.

### Example

``` text
SCIENCE OPPORTUNITY

Hydrated mineral signature
420 m from planned traverse

Estimated Detour: +0.8 km
Estimated Additional Time: +11 min
Terrain Difficulty: Low

[VIEW]
[ADD TO MARSWALK]
```

Another example:

``` text
GEOLOGICAL CONTACT

Boundary between two mapped geological units
180 m northwest

Potential field observation and sampling location.

[VIEW]
[ADD WAYPOINT]
```

### Science Opportunity Ranking

Targets may be characterized using transparent factors such as:

-   Distance from route.
-   Geological significance.
-   Mineralogical observations.
-   Accessibility.
-   Terrain difficulty.
-   Required detour.

MAPA should explain **why** a target has been surfaced rather than
presenting an unexplained score.

------------------------------------------------------------------------

# 8. Traverse Safety Envelope

MAPA can visualize the region that remains practical to explore while
retaining a route back to the habitat/base under the user's selected
mission constraints.

Possible inputs:

-   Maximum Marswalk duration.
-   Current elapsed traverse time.
-   Distance.
-   Assumed walking speed.
-   Terrain difficulty.
-   Slope.
-   Required return reserve.

### Example Alert

``` text
RETURN THRESHOLD APPROACHING

Distance to Base:       2.7 km
Estimated Return:       1 h 12 min
Remaining EVA Window:   1 h 38 min

Consider returning to base.
```

This feature should be described as a **traverse planning/safety
estimate**, not as a precise prediction of astronaut oxygen consumption
or medical condition unless validated physiological data are actually
incorporated.

------------------------------------------------------------------------

# 9. EVA Interface

The EVA view should be significantly simpler than the planning
interface.

### Example Layout

``` text
┌──────────────────────────────────────────┐
│               MAPA / EVA                 │
│                                          │
│ RETURN ESTIMATE             01:42        │
│ DISTANCE TO BASE            2.7 km       │
│ NEXT TARGET                 340 m        │
│                                          │
│                   ↑                      │
│                   │                      │
│                TARGET                    │
│                   │                      │
│                  EVA                     │
│                                          │
│ NEXT                                     │
│ GEOLOGICAL OUTCROP                       │
│ 340 m • +21 m elevation                  │
│                                          │
│ WARNING: Slope increase in 120 m         │
│                                          │
│ [SCIENCE] [ROUTE] [RETURN TO BASE]       │
└──────────────────────────────────────────┘
```

### Design Principles

-   High contrast.
-   Large controls.
-   Minimal text.
-   Essential information only.
-   Clear warnings.
-   Limited menu depth.
-   Avoid unnecessary animations.
-   Make important information understandable at a glance.

------------------------------------------------------------------------

# 10. Historical NASA Mission Layer

Previous robotic missions should function as supporting contextual data.

Possible selectable missions include:

-   Perseverance.
-   Curiosity.
-   Opportunity.
-   Spirit.

Where datasets permit, MAPA may display:

-   Rover route.
-   Mission waypoints.
-   Science observations.
-   Sampling locations.
-   Images.
-   Sol/date.
-   Distance travelled.
-   Instrument observations.

Historical traverses can provide context for how robotic exploration has
previously investigated Martian terrain.

They should remain secondary to human Marswalk planning.

------------------------------------------------------------------------

# 11. Data Provenance

Every scientific layer should clearly identify its origin.

This is particularly important because the challenge asks teams to
integrate information from multiple NASA science missions.

### Example

``` text
MOLA ELEVATION

Instrument:
Mars Orbiter Laser Altimeter

Mission:
Mars Global Surveyor

Provider:
NASA GSFC

Data Product:
[Dataset/product identifier]

Resolution:
[Dataset resolution]

[ABOUT DATA]
```

Other potential sources/instruments may include:

-   **MOLA** --- elevation/topography.
-   **HiRISE** --- high-resolution imagery.
-   **CTX** --- contextual orbital imagery.
-   **CRISM** --- mineralogical observations.
-   **THEMIS** --- thermal and visible imaging.

Actual datasets used by MAPA should be verified and documented.

------------------------------------------------------------------------

# 12. Data Transparency

MAPA should distinguish three categories of information.

## Observed

Directly sourced from a NASA dataset.

Example:

> MOLA elevation measurement.

## Derived

Calculated by MAPA using NASA data.

Example:

> Terrain slope calculated from elevation data.

## Estimated

Calculated using assumptions or simplified mission models.

Example:

> Estimated Marswalk duration based on route distance and assumed
> walking speed.

The UI should communicate these differences to avoid implying that every
displayed value is directly measured by NASA.

------------------------------------------------------------------------

# 13. Recommended Navigation

``` text
MAPA

[EXPLORE] [PLAN MARSWALK] [EVA]
```

## Explore

Used for:

-   Map exploration.
-   Dataset layers.
-   Location inspection.
-   NASA mission context.
-   Scientific discovery.

## Plan Marswalk

Used for:

-   Route creation.
-   Waypoints.
-   Science targets.
-   Terrain analysis.
-   Elevation profile.
-   Hazard analysis.
-   Traverse estimates.
-   Marswalk review.

## EVA

Used for:

-   Route navigation.
-   Next waypoint.
-   Science stops.
-   Hazard warnings.
-   Return information.

------------------------------------------------------------------------

# 14. Suggested Product Identity

## MAPA

### Marswalk Analysis & Planning Assistant

Suggested description:

> **MAPA transforms NASA's distributed Mars datasets into an integrated
> exploration map that helps astronauts plan safer, scientifically
> valuable Marswalks.**

Alternative short description:

> **An integrated Mars mapping and decision-support system for human
> surface exploration.**

------------------------------------------------------------------------

# 15. Demo Scenario

The final demonstration should tell a simple story rather than showing
unrelated functionality.

### Step 1 --- Explore

An astronaut examines a candidate region of Mars using MAPA.

### Step 2 --- Layer NASA Data

The astronaut activates:

-   Surface imagery.
-   Elevation.
-   Slope.
-   Geology.
-   Mineralogy.

### Step 3 --- Choose Objective

The astronaut selects a scientifically interesting outcrop.

### Step 4 --- Plan Marswalk

MAPA generates a route from the habitat to the target.

### Step 5 --- Analyze

MAPA displays:

-   Distance.
-   Elevation profile.
-   Slope.
-   Terrain difficulty.
-   Hazards.
-   Nearby science opportunities.

### Step 6 --- Modify Route

MAPA identifies an additional science target close to the original
route.

The astronaut adds it as a waypoint.

### Step 7 --- Begin EVA

The interface switches into simplified EVA mode.

### Step 8 --- Navigate and Conduct Science

MAPA provides:

-   Navigation.
-   Next waypoint.
-   Distance.
-   Terrain warnings.
-   Science target information.

### Step 9 --- Return

MAPA maintains return-to-base information and guides the astronaut back
to the habitat.

------------------------------------------------------------------------

# 16. Feature Priority

## MVP --- Essential

These features should be prioritized for a functional Space Apps
prototype:

1.  Interactive Mars map.
2.  NASA surface imagery.
3.  Elevation layer.
4.  Slope layer.
5.  At least one meaningful science layer.
6.  Layer controls and opacity.
7.  Site information card.
8.  Start/destination selection.
9.  Marswalk route drawing/generation.
10. Distance calculation.
11. Elevation profile.
12. Science waypoint support.
13. Data-source/provenance information.

## High-Value Enhancements

If development time permits:

-   Terrain-aware route generation.
-   Science opportunity detection.
-   Hazard warnings.
-   Alternative routes.
-   Traverse safety envelope.
-   Simplified EVA mode.
-   Historical rover traverses.
-   Route export/save.
-   Site comparison.

## Stretch Features

Only implement these after the core experience works reliably:

-   Advanced terrain optimization.
-   Communications line-of-sight modelling.
-   Detailed thermal/environmental modelling.
-   Resource-aware route optimization.
-   Offline/cached EVA map.
-   Collaborative mission planning.
-   3D terrain visualization.
-   AR/helmet-display concept.
-   Machine-learning-assisted science target detection.

------------------------------------------------------------------------

# 17. Features to Avoid Over-Prioritizing

For this challenge, MAPA should avoid becoming primarily:

-   A Mars colony simulator.
-   A spacecraft trajectory planner.
-   A Mars landing simulator.
-   A rover-control system.
-   A complete life-support simulator.
-   A generic 3D Mars globe.
-   A full crewed mission architecture tool.

These areas can provide context but would dilute the central Marswalk
use case.

------------------------------------------------------------------------

# 18. Product Success Criteria

A successful MAPA prototype should allow a user to answer:

1.  **Where am I going?**
2.  **How far is it?**
3.  **What terrain will I cross?**
4.  **How steep is the route?**
5.  **What hazards should I know about?**
6.  **What scientifically interesting locations are nearby?**
7.  **Which NASA datasets support this information?**
8.  **How can I return to my base?**

If the prototype answers these clearly through an integrated Mars map,
it directly addresses the core challenge.

------------------------------------------------------------------------

# 19. Core Product Principle

MAPA should not simply answer:

> **What does Mars look like?**

It should help answer:

> **How should we explore this part of Mars?**

Every major feature should support that question through transparent use
of NASA data, route analysis, scientific context, or Marswalk decision
support.
