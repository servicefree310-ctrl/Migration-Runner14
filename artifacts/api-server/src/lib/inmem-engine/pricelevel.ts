import type { Order } from "./types";

// Per-price-level FIFO of orders, implemented as a doubly-linked list of
// nodes. Why not a JS array?
//
//   - Array.shift() on the head is O(n) (V8 has to slide every element).
//     A real exchange's best-price level can churn thousands of orders per
//     second; an O(n) head-pop would dominate matching latency.
//   - A linked list gives true O(1) push/pop on both ends and O(1) cancel
//     of any specific order if we keep a node pointer in an index.
//
// We deliberately keep nodes plain objects (not class instances) — V8 maps
// these to hidden classes and they stay in the young generation as long as
// they're short-lived, which is exactly the case for hot-trading orders.

export interface OrderNode {
  order: Order;
  prev: OrderNode | null;
  next: OrderNode | null;
}

export class PriceLevel {
  readonly price: number;
  /** Sum of `remaining` across every node — kept incrementally so depth
   *  snapshots don't need to walk the list. */
  totalQty = 0;
  /** Number of resting orders at this level. */
  count = 0;
  head: OrderNode | null = null;
  tail: OrderNode | null = null;

  constructor(price: number) {
    this.price = price;
  }

  /** Append to the tail — preserves time priority since older orders sit
   *  at the head and get matched first. */
  push(order: Order): OrderNode {
    const node: OrderNode = { order, prev: this.tail, next: null };
    if (this.tail) this.tail.next = node;
    else this.head = node;
    this.tail = node;
    this.totalQty += order.remaining;
    this.count++;
    return node;
  }

  /** Remove a specific node in O(1). Caller is responsible for keeping the
   *  node pointer alive in the engine-level order index. */
  unlink(node: OrderNode): void {
    if (node.prev) node.prev.next = node.next;
    else this.head = node.next;
    if (node.next) node.next.prev = node.prev;
    else this.tail = node.prev;
    node.prev = null;
    node.next = null;
    this.totalQty -= node.order.remaining;
    this.count--;
  }

  /** Adjust the level's running total when a partial fill mutates a node's
   *  `remaining` IN PLACE. The engine calls this instead of touching
   *  `totalQty` directly so the bookkeeping stays in one file. */
  decreaseTotal(by: number): void {
    this.totalQty -= by;
  }

  isEmpty(): boolean {
    return this.head === null;
  }
}
