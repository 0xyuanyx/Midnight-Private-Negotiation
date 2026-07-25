const IDENTIFIER = /^[A-Za-z0-9_-]{1,64}$/;

export const createRoomSessionId = (
  productCode: string,
  demoInstanceId: string,
): string => {
  if (!/^\d{4}$/.test(productCode) || !IDENTIFIER.test(demoInstanceId)) {
    throw new Error("invalid demo room identity");
  }
  const sessionId = `room-${productCode}-${demoInstanceId}`;
  if (!IDENTIFIER.test(sessionId)) {
    throw new Error("demo room identity is too long");
  }
  return sessionId;
};
