# Veritas Progressive Rendering Refactoring Plan

## Overview
Eliminate the 15-second global loading screen by splitting the UI into two streaming stages:
- **Fast HUD:** Instant render (on-chain metrics, liquidity, market cap, holders, age)
- **Slow Vision:** Suspense-wrapped (AI analysis, visual report, vibe meter, trust score)

---

## Component Tree Structure

```
TruthConsole (Client Root)
├── SearchInput (instant)
├── ErrorBoundary
└── ResultContainer (conditionally rendered)
    ├── FastHUD (Suspense boundary #1)
    │   ├── Metrics Grid (LIQ, MCAP, TOP10, AGE)
    │   ├── OnChain Stats (Mint/Freeze Auth, Supply, Decimals)
    │   └── Fallback: SkeletonFastHUD
    │
    └── SlowVision (Suspense boundary #2)
        ├── VerdictBadge (APE/DYOR/RUN + Trust Score)
        ├── DegenComment
        ├── FlagsDisplay
        ├── AIVisionBox (Visual Analysis)
        ├── LiesDetected
        ├── DetailsCollapsible
        │   ├── CriminalProfile
        │   ├── RugCheckRisks
        │   └── SocialLinks
        └── Fallback: SkeletonSlowVision
```

---

## New Files to Create

### 1. `src/components/truth/FastHUD.tsx`
**Renders instantly with on-chain + market data**
- `<Metrics />` grid (LIQ, MCAP, TOP10, AGE)
- On-chain badges (Mint Auth, Freeze Auth, Creator %, Dumped flag)
- Wrapped in `<Suspense fallback={<SkeletonFastHUD />}>`

### 2. `src/components/truth/SlowVision.tsx`
**Wraps AI-dependent sections in Suspense**
- Verdict badge + trust score
- Degen comment
- Red flags display (isKnownScammer, SCAM TEMPLATE, BOTS, etc.)
- AI Vision box (visualAnalysis)
- Lies Detected box
- Details toggle (criminal profile, audit risks, socials)
- Wrapped in `<Suspense fallback={<SkeletonSlowVision />}>`

### 3. `src/components/truth/VerdictCard.tsx`
**Orchestrator component that combines FastHUD + SlowVision**
- Manages verdict config
- Coordinates flag detection
- Owns copy-to-clipboard logic

### 4. `src/components/truth/skeletons/SkeletonFastHUD.tsx`
**Animated pulse placeholders for metrics**
- 4 boxes pulsing (metrics grid)
- Minimal layout, no text
- CSS `animate-pulse` in `bg-zinc-900/30 to zinc-900/50`

### 5. `src/components/truth/skeletons/SkeletonSlowVision.tsx`
**Animated skeleton for verdict + AI sections**
- Large pulsing box for verdict area
- Multiple smaller boxes for AI Vision, Lies, Details
- Staggered animation (waves of loading)
- Duration: 800ms pulse, repeating
- Colored accents matching theme (cyan, red, amber lines)

---

## Suspense Boundary Placement

```tsx
{result && !loading && (
  <>
    <Suspense fallback={<SkeletonFastHUD />}>
      <FastHUD result={result} />
    </Suspense>

    <Suspense fallback={<SkeletonSlowVision />}>
      <SlowVision result={result} onCopy={handleCopyVerdict} copied={copied} />
    </Suspense>
  </>
)}
```

---

## Skeleton Fallback Designs

### SkeletonFastHUD
```
┌─────────────────────┐
│ ▓▓▓▓▓  ▓▓▓▓▓ ▓▓▓▓▓ │  3 pulsing metric boxes (grid)
│ ▓▓▓▓▓  ▓▓▓▓▓ ▓▓▓▓▓ │
│       ▓▓▓▓▓ ▓▓▓▓▓ │  2 onchain stat boxes
└─────────────────────┘
```

**Implementation:**
- CSS `animate-pulse`
- Subtle color: `bg-zinc-900/30` → `bg-zinc-900/50`
- No text, just box shapes matching FastHUD layout

### SkeletonSlowVision
```
┌──────────────────────────┐
│  ████ THINKING ████      │  Big pulsing verdict area
│  ████ ANALYZING ████     │  
├──────────────────────────┤
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │  AI Vision skeleton
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
├──────────────────────────┤
│ ▓▓▓▓▓ ▓▓▓▓▓ ▓▓▓▓▓        │  Flags skeleton
└──────────────────────────┘
```

**Implementation:**
- Staggered opacity animations (wave effect)
- Colored accents: cyan line (AI), red line (danger), amber line (risks)
- Duration: 800ms pulse, repeating infinitely
- `transition-opacity` for smooth waves

---

## Data Flow Architecture

### Current (Monolithic Loading)
```
TruthConsole → fetch /api/analyze-unified → [wait 15s blank screen] → render everything at once
```

### After Refactoring (Progressive Perception)
```
TruthConsole → fetch /api/analyze-unified
    ↓
    [show FastHUD skeleton]
    ↓
    [parse result.onChain + result.market → Suspense #1 resolves]
    ↓
    [render FastHUD instantly with metrics, age, liquidity, holders]
    ↓
    [result.visualAnalysis + criminalProfile ready → Suspense #2 resolves]
    ↓
    [render SlowVision with AI verdict, vision analysis, flags]
```

**Note:** Since `/api/analyze-unified` returns complete result at once, the Suspense "slowness" is **intentional UX stage-setting**. Later, we can split backend into parallel streams for true progressive results.

---

## Global CryptoLoader Removal

✅ **Status: DELETE**

Files affected:
- `src/components/ui/CryptoLoader.tsx` → **DELETE**
- `src/components/truth/TruthConsole.tsx` → Remove import + usage
- `src/components/ui/index.ts` → Remove export (if applicable)

Replacement:
- Use granular `SkeletonFastHUD` + `SkeletonSlowVision` instead
- Skeletons render **within** result container, not full-screen overlay
- No more monolithic spinner

---

## Summary of Changes

| Item | Action | Details |
|------|--------|---------|
| **Delete** | `CryptoLoader.tsx` | Monolithic loader eliminated |
| **Create** | `FastHUD.tsx` | Fast metrics component |
| **Create** | `SlowVision.tsx` | Slow AI-analytics component |
| **Create** | `SkeletonFastHUD.tsx` | Fast skeleton fallback |
| **Create** | `SkeletonSlowVision.tsx` | Slow skeleton fallback |
| **Refactor** | `TruthConsole.tsx` | Remove loader, add Suspense boundaries |
| **Refactor** | `VerdictCard.tsx` | Split into orchestrator |
| **API** | `/api/analyze-unified` | No changes (still single response) |
| **Suspense Boundaries** | 2 boundaries | FastHUD + SlowVision |
| **UX Improvement** | Perceived speed | 15s blank → 2-3s FastHUD + progressive refinement |

---

## File Locations Reference

```
src/
├── components/
│   └── truth/
│       ├── TruthConsole.tsx (REFACTOR)
│       ├── VerdictCard.tsx (NEW / REFACTOR)
│       ├── FastHUD.tsx (NEW)
│       ├── SlowVision.tsx (NEW)
│       └── skeletons/
│           ├── SkeletonFastHUD.tsx (NEW)
│           └── SkeletonSlowVision.tsx (NEW)
│   └── ui/
│       └── CryptoLoader.tsx (DELETE)
```

---

## Implementation Checklist

- [ ] Create `FastHUD.tsx` with metrics display
- [ ] Create `SlowVision.tsx` with verdict + AI sections
- [ ] Create `SkeletonFastHUD.tsx` with pulsing boxes
- [ ] Create `SkeletonSlowVision.tsx` with staggered animation
- [ ] Refactor `TruthConsole.tsx` to use Suspense boundaries
- [ ] Refactor `VerdictCard.tsx` as orchestrator
- [ ] Delete `CryptoLoader.tsx`
- [ ] Remove CryptoLoader imports
- [ ] Test progressive rendering in browser
- [ ] Verify accessible fallbacks
- [ ] Deploy and monitor performance

---

**Ready to implement. Awaiting approval to proceed with code generation.**
