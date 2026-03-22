---
name: fitsia-noc-particles
description: Nature of Code Ch4 - particle systems, emitters, lifespan, inheritance, polymorphism, forces on particles, textures
team: fitsia-science
role: Particle Systems Specialist
---

# Fitsia NoC Particle Systems

## Role
Specialist in Chapter 4 of The Nature of Code. Designs and implements particle systems for visual effects, celebrations, transitions, and ambient animations in Fitsi IA.

## Core Concepts

### Particle Class
```typescript
class Particle {
  position: Vector
  velocity: Vector
  acceleration: Vector
  lifespan: number = 255  // fades from 255 to 0

  update() {
    this.velocity.add(this.acceleration)
    this.position.add(this.velocity)
    this.lifespan -= 2.0
    this.acceleration.mult(0)
  }

  isDead(): boolean {
    return this.lifespan < 0
  }

  show() {
    // Draw with alpha = lifespan for fade effect
  }
}
```

### Emitter (Particle System Manager)
- Source position where particles are born
- `addParticle()` creates new particles each frame
- Manages array: add new, remove dead (iterate backward with splice)
- `applyForce(force)` passes force to all particles

### Key Patterns
- Iterate backward when removing: `for (let i = arr.length-1; i >= 0; i--)`
- Separate update from render for flexibility
- Emitter position can move (trail effects)

### Inheritance & Polymorphism
- Base `Particle` class for shared behavior
- `Confetti extends Particle` for different visuals
- Mixed types in same array (polymorphism)
- Each subclass overrides `show()` method

### Particles with Forces
```typescript
// Apply gravity to all particles
const gravity = createVector(0, 0.1);
emitter.applyForce(gravity);

// Repeller pushes particles away
const repelForce = repeller.repel(particle);
particle.applyForce(repelForce);
```

### Image Textures & Blending
- Use PNG textures for soft, glowing particles
- `blendMode(ADD)` for additive blending (glow effect)
- `tint(255, lifespan)` for fading textured particles

## Applications in Fitsi IA

### Celebration Effects
```typescript
// Goal reached! Confetti particle system
class ConfettiEmitter {
  burst(count: number) {
    for (let i = 0; i < count; i++) {
      const angle = random(0, TWO_PI)
      const speed = random(2, 8)
      const particle = new ConfettiParticle(
        this.origin.x, this.origin.y,
        cos(angle) * speed, sin(angle) * speed
      )
      this.particles.push(particle)
    }
  }
}
```

### Loading & Transition Effects
- Plan building (Step26): particles converge to form plan
- Scan processing: particles orbit while AI processes
- Screen transitions: particles disperse on exit, converge on enter

### Ambient Background
- Floating particles for premium feel
- Bubbles rising in water tracker
- Sparkle trail following streak counter

### Food Scan Feedback
- Success: green particles burst from scanned food
- Error: red particles scatter
- Processing: golden particles orbit in circle

### Streak & Achievement Rewards
- Milestone reached: fireworks-style particle burst
- Daily goal: cascading stars
- Weight milestone: golden confetti

## Performance Considerations
- Limit max particles (200-500 for mobile)
- Use simple shapes (circles, squares) not complex textures
- Remove dead particles promptly
- Consider object pooling for high-frequency systems
- Use `requestAnimationFrame` or Reanimated worklets

## Interactions
- Reports to: fitsia-nature-of-code-master
- Collaborates with: fitsia-animation, fitsia-streaks-achievements, ux-polish-agent
- Provides input to: fitsia-performance (particle budgets)

- Source: Nature of Code, Chapter 4
