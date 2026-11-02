// SPDX-License-Identifier: Apache-2.0
// Display-only chapter-position estimate, not a completion flag or time estimate.
// CrimsonDB's permitted main-story list was checked 2026-11-01:
// https://crimsondb.gg/quests lists I–XII, with Prologue/Epilogue separately.
// Only the normalized, owner-verified menu mapping is accepted here. Save
// record counts, arbitrary quest IDs and reference-preset names cannot supply it.
export const STORY_PROGRESS_CHAPTERS=12;
export const STORY_PROGRESS_SOURCE='https://crimsondb.gg/quests';

export function estimateStoryProgress(chapter){
  const number=chapter?.number;
  if(chapter?.mapping!=='owner_verified_menu_pair'||!Number.isInteger(number)||number<1||number>STORY_PROGRESS_CHAPTERS)return null;
  // Being in chapter N does not mean N has been completed. In particular,
  // entering the final chapter must not produce a claimed 100% completion.
  const completedChapterEstimate=number-1;
  return {
    percent:Math.round(completedChapterEstimate/STORY_PROGRESS_CHAPTERS*100),
    currentChapter:number,
    totalChapters:STORY_PROGRESS_CHAPTERS,
    completedChapterEstimate,
    label:'Estimated story progress',
    detail:'Based on chapter position only. Chapters vary in length; prologue, epilogue and side content are not measured.',
    sourceUrl:STORY_PROGRESS_SOURCE
  };
}
