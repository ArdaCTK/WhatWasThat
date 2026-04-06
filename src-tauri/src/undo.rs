use crate::models::Screenshot;
use std::collections::VecDeque;

pub struct UndoStack { items: VecDeque<Screenshot> }

impl UndoStack {
    pub fn new() -> Self { Self { items: VecDeque::with_capacity(10) } }
    pub fn push(&mut self, ss: Screenshot) {
        if self.items.len() >= 10 { self.items.pop_front(); }
        self.items.push_back(ss);
    }
    pub fn pop(&mut self) -> Option<Screenshot> { self.items.pop_back() }
    pub fn peek(&self) -> Option<&Screenshot> { self.items.back() }
    pub fn len(&self) -> usize { self.items.len() }
    pub fn is_empty(&self) -> bool { self.items.is_empty() }
}
