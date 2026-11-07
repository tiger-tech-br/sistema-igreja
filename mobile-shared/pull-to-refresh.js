const interactive = target => Boolean(target?.closest?.('input, textarea, select, button, a, label, [role="button"], [contenteditable]:not([contenteditable="false"])'));

// Only recognizes an intentional downward touch gesture. Data loading and session
// handling remain with the screen; this controller never reloads the WebView.
export class PullToRefresh {
  constructor({ canRefresh, refresh, onState = () => {}, scrollTop = () => 0, ignoreTarget = interactive, threshold = 80 }) {
    Object.assign(this, { canRefresh, refresh, onState, scrollTop, ignoreTarget, threshold });
    this.gesture = null;
    this.busy = false;
    this.generation = 0;
  }

  emit(phase, distance = 0) { this.onState({ phase, distance }); }

  reset() {
    this.generation++;
    this.gesture = null;
    this.busy = false;
    this.emit('idle');
  }

  start(event) {
    if (this.busy) return;
    if (this.gesture) this.reset();
    if (!this.canRefresh() || this.scrollTop() > 1 || event.touches?.length !== 1 || this.ignoreTarget(event.target)) return;
    const touch = event.touches[0];
    this.gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, distance: 0 };
  }

  move(event) {
    const gesture = this.gesture;
    if (!gesture) return;
    if (!this.canRefresh() || this.scrollTop() > 1 || event.touches?.length !== 1 || event.touches[0].identifier !== gesture.id) return this.reset();
    const touch = event.touches[0];
    const x = Math.abs(touch.clientX - gesture.x);
    const y = touch.clientY - gesture.y;
    if (y < -8 || (x > 10 && x > Math.abs(y))) return this.reset();
    if (y <= 10) {
      if (gesture.distance > 0) this.emit('pulling', 0);
      gesture.distance = 0;
      return;
    }
    if (event.cancelable) event.preventDefault();
    gesture.distance = Math.min(y, 120);
    this.emit(y >= this.threshold ? 'ready' : 'pulling', gesture.distance);
  }

  async end() {
    const gesture = this.gesture;
    if (!gesture || this.busy) return;
    this.gesture = null;
    if (gesture.distance < this.threshold || !this.canRefresh() || this.scrollTop() > 1) return this.reset();
    this.busy = true;
    const generation = this.generation;
    this.emit('refreshing', this.threshold);
    try { await this.refresh(); }
    catch { /* The screen keeps its existing error notice; no success is shown. */ }
    finally {
      if (generation === this.generation) {
        this.busy = false;
        this.emit('idle');
      }
    }
  }

  cancel() { if (this.gesture) this.reset(); }
}
