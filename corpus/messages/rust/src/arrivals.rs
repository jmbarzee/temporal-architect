//! A signal's or update's pending arrivals and the waiters for them, each oldest first (spec 06
//! "Signal and update arrival"). A handler adds an arrival when it returns; the waiter that began
//! first takes the oldest.
//!
//! Rust futures are lazy and only run when polled, so a bound promise is not polled until it is
//! awaited. Arrivals are therefore matched by position, not handed over at poll time: the waiter
//! k-th in line owns the k-th oldest pending arrival, and is ready once that arrival exists.
//! Taking removes both; leaving without taking moves every later waiter up one place.

use std::collections::VecDeque;

use temporalio_sdk::{WorkflowCancellationError, WorkflowContext};

pub struct Arrivals<T> {
    pending: VecDeque<T>,
    waiters: VecDeque<u64>, // tickets, in the order their waiters began
    next: u64,
}

impl<T> Default for Arrivals<T> {
    fn default() -> Self {
        Self {
            pending: VecDeque::new(),
            waiters: VecDeque::new(),
            next: 0,
        }
    }
}

impl<T> Arrivals<T> {
    pub fn add(&mut self, v: T) {
        self.pending.push_back(v);
    }

    fn begin(&mut self) -> u64 {
        let t = self.next;
        self.next += 1;
        self.waiters.push_back(t);
        t
    }

    fn place(&self, t: u64) -> Option<usize> {
        self.waiters.iter().position(|w| *w == t)
    }

    fn ready(&self, t: u64) -> bool {
        self.place(t).is_some_and(|i| i < self.pending.len())
    }

    fn claim(&mut self, t: u64) -> T {
        let i = self.place(t).expect("waiter");
        self.waiters.remove(i);
        self.pending.remove(i).expect("ready")
    }

    fn leave(&mut self, t: u64) {
        if let Some(i) = self.place(t) {
            self.waiters.remove(i);
        }
    }
}

/// Where a workflow keeps one signal's or update's arrivals: `of!(field)`.
pub struct Of<W, T> {
    pub get: fn(&W) -> &Arrivals<T>,
    pub get_mut: fn(&mut W) -> &mut Arrivals<T>,
}
impl<W, T> Clone for Of<W, T> {
    fn clone(&self) -> Self {
        *self
    }
}
impl<W, T> Copy for Of<W, T> {}

#[macro_export]
macro_rules! of {
    ($field:ident) => {
        $crate::arrivals::Of {
            get: |w| &w.$field,
            get_mut: |w| &mut w.$field,
        }
    };
}

/// Ends a waiter that has not taken, when its future is dropped: a cancelled waiter or a losing
/// `await one` case. After a take it does nothing.
struct Leave<W: 'static, T: 'static> {
    ctx: WorkflowContext<W>,
    of: Of<W, T>,
    ticket: u64,
}
impl<W, T> Drop for Leave<W, T> {
    fn drop(&mut self) {
        let (of, t) = (self.of, self.ticket);
        self.ctx.state_mut(|w| (of.get_mut)(w).leave(t));
    }
}

/// Begins waiting now and returns the wait. Awaited at once it is `await signal X`; bound and
/// awaited later it is `promise p <- signal X`, which began waiting at its binding. As an
/// `await one` case it takes an arrival only if it wins: `select!` polls cases in listed order and
/// drops the losers, and a dropped wait leaves the line without taking.
pub fn take<W: 'static, T: 'static>(
    ctx: &WorkflowContext<W>,
    of: Of<W, T>,
) -> impl Future<Output = Result<T, WorkflowCancellationError>> + use<W, T> {
    let ticket = ctx.state_mut(|w| (of.get_mut)(w).begin());
    let leave = Leave {
        ctx: ctx.clone(),
        of,
        ticket,
    };
    async move {
        leave
            .ctx
            .wait_condition(|w| (of.get)(w).ready(ticket))
            .await?;
        Ok(leave.ctx.state_mut(|w| (of.get_mut)(w).claim(ticket)))
    }
}
