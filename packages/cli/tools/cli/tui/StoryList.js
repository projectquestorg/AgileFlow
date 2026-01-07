/**
 * StoryList Component
 *
 * BETA - Story list rendering for TUI
 */

class StoryList {
  constructor(stories = []) {
    this.stories = stories;
    this.selectedIndex = 0;
  }

  setStories(stories) {
    this.stories = stories;
    this.selectedIndex = 0;
  }

  selectNext() {
    if (this.selectedIndex < this.stories.length - 1) {
      this.selectedIndex++;
    }
    return this.getSelected();
  }

  selectPrev() {
    if (this.selectedIndex > 0) {
      this.selectedIndex--;
    }
    return this.getSelected();
  }

  getSelected() {
    return this.stories[this.selectedIndex] || null;
  }

  filter(predicate) {
    return new StoryList(this.stories.filter(predicate));
  }

  sortByPriority() {
    const priorityOrder = {
      blocked: 0,
      in_progress: 1,
      'in-progress': 1,
      ready: 2,
      draft: 3,
      completed: 4,
      done: 4,
    };

    return new StoryList(
      [...this.stories].sort((a, b) => {
        const aPriority = priorityOrder[a.status] ?? 99;
        const bPriority = priorityOrder[b.status] ?? 99;
        return aPriority - bPriority;
      })
    );
  }

  toArray() {
    return [...this.stories];
  }

  get length() {
    return this.stories.length;
  }
}

module.exports = StoryList;
