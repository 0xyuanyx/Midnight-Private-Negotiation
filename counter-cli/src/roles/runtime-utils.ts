import {
  parseParentToRoleMessage,
  type ParentToRoleMessage,
  type RoleToParentMessage,
  type RuntimeFailureCode,
} from '../isolation/child-protocol';

const inbox: ParentToRoleMessage[] = [];
const waiters: Array<{
  predicate: (message: ParentToRoleMessage) => boolean;
  resolve: (message: ParentToRoleMessage) => void;
}> = [];

process.on('message', (value: unknown) => {
  const message = parseParentToRoleMessage(value);
  const waiterIndex = waiters.findIndex(({ predicate }) => predicate(message));
  if (waiterIndex >= 0) {
    const [waiter] = waiters.splice(waiterIndex, 1);
    waiter.resolve(message);
  } else {
    inbox.push(message);
  }
});

export const waitForParent = async <T extends ParentToRoleMessage>(
  predicate: (message: ParentToRoleMessage) => message is T,
): Promise<T> => {
  const messageIndex = inbox.findIndex(predicate);
  if (messageIndex >= 0) {
    return inbox.splice(messageIndex, 1)[0] as T;
  }
  return await new Promise<T>((resolve) => {
    waiters.push({
      predicate,
      resolve: (message) => resolve(message as T),
    });
  });
};

export const sendToParent = (message: RoleToParentMessage): void => {
  if (process.send === undefined) {
    throw new Error('role runtime requires an IPC parent');
  }
  process.send(message);
};

export const publicError = (_error: unknown): RuntimeFailureCode => 'RUNTIME_FAILED';
