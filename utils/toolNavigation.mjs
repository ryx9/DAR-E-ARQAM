// Pick the closest tile in the requested visual direction, favouring alignment.
export function findDirectionalTool(rectangles, currentIndex, direction) {
  const current = rectangles[currentIndex];
  if (!current) return -1;
  const horizontal = direction === 'ArrowLeft' || direction === 'ArrowRight';
  const sign = direction === 'ArrowLeft' || direction === 'ArrowUp' ? -1 : 1;
  const center = rect => ({ x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 });
  const origin = center(current);
  let best = -1;
  let bestScore = Infinity;
  rectangles.forEach((rect, index) => {
    if (index === currentIndex) return;
    const point = center(rect);
    const primary = (horizontal ? point.x - origin.x : point.y - origin.y) * sign;
    if (primary <= 1) return;
    const cross = Math.abs(horizontal ? point.y - origin.y : point.x - origin.x);
    const score = primary + cross * 2;
    if (score < bestScore) {
      best = index;
      bestScore = score;
    }
  });
  return best;
}
