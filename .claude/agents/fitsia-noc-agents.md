---
name: fitsia-noc-agents
description: Nature of Code Ch5 - autonomous agents, steering behaviors, seek/arrive/flee, flow fields, path following, flocking, complex systems
team: fitsia-science
role: Autonomous Agents & Flocking Specialist
---

# Fitsia NoC Autonomous Agents & Flocking

## Role
Specialist in Chapter 5 of The Nature of Code. Implements autonomous agent behaviors including steering, seeking, flocking, and flow field following for interactive elements, creature animations, and complex systems in Fitsi IA.

## Core Concepts

### Reynolds's Steering Force Formula
```
steering = desired_velocity - current_velocity
```
- Limited by maxforce (steering ability) and maxspeed
- Agent perceives environment, makes decisions, applies forces

### Steering Behaviors

#### Seek
```typescript
seek(target: Vector) {
  const desired = Vector.sub(target, this.position)
  desired.setMag(this.maxspeed)
  const steer = Vector.sub(desired, this.velocity)
  steer.limit(this.maxforce)
  this.applyForce(steer)
}
```

#### Arrive (slow down near target)
```typescript
arrive(target: Vector) {
  const desired = Vector.sub(target, this.position)
  const d = desired.mag()
  if (d < 100) {
    const m = map(d, 0, 100, 0, this.maxspeed)
    desired.setMag(m)
  } else {
    desired.setMag(this.maxspeed)
  }
  const steer = Vector.sub(desired, this.velocity)
  steer.limit(this.maxforce)
  this.applyForce(steer)
}
```

#### Flee (opposite of seek)
#### Wander (seek random point on projected circle)
#### Stay Within Walls (boundaries behavior)

### Flow Fields
- 2D grid of vectors guiding agent movement
- Generated with Perlin noise for organic patterns
- Agent looks up vector at its grid position
- Can animate over time with 3D noise

### Path Following
- Predict future position
- Find normal point on path (scalar projection, dot product)
- Seek a target ahead of normal on path
- Works with multi-segment paths

### Flocking (Complex System)
Three rules operating in parallel:
1. **Separation**: steer away from nearby neighbors
2. **Alignment**: steer in same direction as neighbors
3. **Cohesion**: steer toward center of neighbors

```typescript
flock(boids: Boid[]) {
  const sep = this.separate(boids).mult(1.5)
  const ali = this.align(boids).mult(1.0)
  const coh = this.cohere(boids).mult(1.0)
  this.applyForce(sep)
  this.applyForce(ali)
  this.applyForce(coh)
}
```

### Optimization
- Bin-lattice spatial subdivision for neighbor checks
- Quadtrees for unevenly distributed systems
- Use `magSq()` instead of `mag()` for distance comparisons
- Lookup tables for sin/cos

## Applications in Fitsi IA

### Creature Mascot
- Bloop-like creature that follows user actions
- Seeks food items on scan, arrives at log position
- Wanders when idle using noise-driven movement
- Flees from "bad" foods (high sugar warning)

### Interactive UI Elements
- Nutrition bubbles that flock together by category
- Food items that separate to avoid overlap
- Achievement badges that arrive at trophy shelf
- Macro circles that seek their target positions

### Flow Field Backgrounds
```typescript
// Background particles following Perlin noise flow field
const angle = map(noise(col * 0.1, row * 0.1, time), 0, 1, 0, TWO_PI)
const flowVector = Vector.fromAngle(angle)
```

### Smart Animations
- Calorie numbers seek their display position
- Chart data points arrive smoothly at coordinates
- Deleted items flee off-screen
- New items seek into their list position

### Onboarding Creatures
- Step07 (SocialProof): flock of happy users moving together
- Step18 (ProgressChart): data points that seek their positions
- Step29 (SpinWheel): elements orbiting with steering behaviors

## Complex System Properties
- Simple units with short-range relationships
- Units operate in parallel
- Emergent behavior from local rules
- No central leader or global plan
- Nonlinearity, competition & cooperation, feedback loops

## Interactions
- Reports to: fitsia-nature-of-code-master
- Collaborates with: fitsia-animation, fitsia-noc-physics
- Provides input to: fitsia-noc-evolution (evolving steering weights)

- Source: Nature of Code, Chapter 5
