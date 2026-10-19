// 公車與球的物理：全部是純函式，時間 t 的單位是秒，距離是公尺。
// 位置都以「地面」為參考座標，t = 0 時公車在 0 公尺。

export const BUS_SPEED = 10; // 公尺/秒
export const THROW_UP_SPEED = 5; // 公尺/秒
export const GRAVITY = 10; // 公尺/秒²
export const BRAKE_DECEL = 8; // 公尺/秒²，煞車後第 1 秒公車走 6 公尺，和 1-1 的數字一致
export const FLIGHT_TIME = (2 * THROW_UP_SPEED) / GRAVITY; // 球在空中的時間，剛好 1 秒

// brakeAt：開始煞車的時間；null 代表從頭到尾沒有煞車。
export function busSpeed(t: number, brakeAt: number | null): number {
  if (brakeAt === null || t <= brakeAt) return BUS_SPEED;
  return Math.max(0, BUS_SPEED - BRAKE_DECEL * (t - brakeAt));
}

// 煞車後減速到 0 就停住，不會倒退。
export function busPosition(t: number, brakeAt: number | null): number {
  if (brakeAt === null || t <= brakeAt) return BUS_SPEED * t;
  const stopTime = BUS_SPEED / BRAKE_DECEL;
  const braking = Math.min(t - brakeAt, stopTime);
  return BUS_SPEED * brakeAt + BUS_SPEED * braking - 0.5 * BRAKE_DECEL * braking * braking;
}

// 球離手的瞬間，水平速度等於當下的公車速度，之後保持不變（慣性）。
// 丟出去之前，球在手上，跟著公車走。落地之後球停在落點。
export function ballPosition(
  t: number,
  throwAt: number,
  brakeAt: number | null,
): { x: number; y: number; landed: boolean } {
  if (t < throwAt) return { x: busPosition(t, brakeAt), y: 0, landed: false };
  const speedX = busSpeed(throwAt, brakeAt);
  const startX = busPosition(throwAt, brakeAt);
  if (t >= throwAt + FLIGHT_TIME) return { x: startX + speedX * FLIGHT_TIME, y: 0, landed: true };
  const flight = t - throwAt;
  return {
    x: startX + speedX * flight,
    y: THROW_UP_SPEED * flight - 0.5 * GRAVITY * flight * flight,
    landed: false,
  };
}

// 落地時，球的 x 減去公車的 x。正數代表球落在手的前方。
export function landingOffset(throwAt: number, brakeAt: number | null): number {
  const landAt = throwAt + FLIGHT_TIME;
  return ballPosition(landAt, throwAt, brakeAt).x - busPosition(landAt, brakeAt);
}

// 結果文字：四捨五入到小數點後一位；偏差小到顯示成 0.0 就當作落在手上。
export function landingText(offset: number): string {
  const rounded = Math.round(offset * 10) / 10;
  return rounded === 0 ? '落在手上' : `落在你前方 ${rounded.toFixed(1)} 公尺`;
}
