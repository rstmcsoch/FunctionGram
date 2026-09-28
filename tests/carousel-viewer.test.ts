import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Carousel } from '../components/social/common';
import { PostMedia } from '../components/social/post-card';
import type { Post } from '../lib/types';

test('Multi-photo carousel renders horizontal track, slides, and indicators', () => {
  const items = ['/media/japan.jpg', '/media/architecture.jpg', '/media/road.jpg'];
  const aspects = [1.5, 1.2, 1.0];

  const html = renderToStaticMarkup(
    React.createElement(Carousel, {
      items,
      aspects,
      ariaLabel: 'Photos by testuser',
      render: (item, index) =>
        React.createElement('img', { src: item, alt: `Photo ${index + 1}` }),
    })
  );

  // Check viewport and track structure required for horizontal sliding
  assert.ok(html.includes('class="carousel-viewport"'), 'Carousel has viewport container for Embla');
  assert.ok(html.includes('class="carousel-track"'), 'Carousel has track container for slides');

  // Verify all slides are rendered with accessibility attributes
  for (let i = 0; i < items.length; i++) {
    assert.ok(html.includes(`aria-label="${i + 1} of ${items.length}"`), `Slide ${i + 1} has slide label`);
  }

  // Check indicators and navigation
  assert.ok(html.includes('<span class="image-number">1/3</span>'), 'Shows 1/3 photo counter');
  assert.ok(html.includes('carousel-back'), 'Has previous button');
  assert.ok(html.includes('carousel-next'), 'Has next button');
  assert.ok(html.includes('carousel-dots'), 'Has dots navigation list');
  assert.ok(html.includes('carousel-dot active'), 'First dot is active');
});

test('PostMedia renders carousel for multi-photo posts and single frame for single photo', () => {
  const multiPost: Post = {
    id: 'post_multi',
    author_id: 'user_1',
    author: { id: 'user_1', username: 'photographer', name: 'Photographer', avatar: '' },
    media: ['/media/japan.jpg', '/media/architecture.jpg'],
    media_type: 'image',
    caption: 'City exploration #travel',
    location: 'Kyoto',
    category: 'Travel',
    likes: 42,
    liked: false,
    saved: false,
    comment_count: 5,
    created_at: Date.now(),
    aspects: [1.5, 1.5],
  };

  const multiHtml = renderToStaticMarkup(React.createElement(PostMedia, { post: multiPost }));
  assert.ok(multiHtml.includes('carousel-viewport'), 'Multi-photo post renders carousel viewport');
  assert.ok(multiHtml.includes('carousel-track'), 'Multi-photo post renders carousel track');
  assert.ok(multiHtml.includes('1/2'), 'Multi-photo post shows 1/2 indicator');

  const singlePost: Post = {
    ...multiPost,
    id: 'post_single',
    media: ['/media/japan.jpg'],
    aspects: [1.5],
  };

  const singleHtml = renderToStaticMarkup(React.createElement(PostMedia, { post: singlePost }));
  assert.ok(!singleHtml.includes('carousel-track'), 'Single photo post does not render carousel track');
  assert.ok(singleHtml.includes('media-frame'), 'Single photo post renders single media frame');
  assert.ok(singleHtml.includes('draggable="false"'), 'Images have draggable=false to prevent native drag');
});

test('CSS rules configure responsive post viewer layout for desktop, tablet, and mobile', () => {
  const css = readFileSync(path.join(process.cwd(), 'app/globals.css'), 'utf8');

  // 1. Carousel horizontal layout and touch gesture handling
  assert.ok(css.includes('touch-action:pan-y pinch-zoom') || css.includes('touch-action: pan-y pinch-zoom'), 'Carousel track has pan-y pinch-zoom for swipe gestures');
  assert.ok(css.includes('flex:0 0 100%') || css.includes('flex: 0 0 100%'), 'Carousel slides are 100% width');
  assert.ok(css.includes('-webkit-user-drag:none') || css.includes('-webkit-user-drag: none'), 'Carousel images disable native ghost dragging');

  // 2. Desktop post viewer layout
  assert.ok(css.includes('social-modal.post-viewer[data-slot=dialog-content]'), 'Post viewer modal overrides default social modal max-width');
  assert.ok(css.includes('1360px'), 'Desktop post viewer uses maximized width up to 1360px');
  assert.ok(css.includes('.post-viewer-media') && css.includes('flex: 1 1 0') || css.includes('flex:1 1 0'), 'Media column takes flexible space on desktop');
  assert.ok(css.includes('.post-viewer-panel'), 'Post viewer panel is defined');

  // 3. Aspect ratio preservation in post viewer
  assert.ok(css.includes('object-fit: contain !important') || css.includes('object-fit:contain!important'), 'Post viewer media uses contain to preserve photo aspect ratios');

  // 4. Mobile responsive layout
  assert.ok(css.includes('@media (max-width: 767px)') || css.includes('@media (max-width:767px)'), 'Has mobile breakpoint for post viewer');
  assert.ok(css.includes('.post-viewer-header-mobile'), 'Has dedicated mobile header to avoid close button collisions');
  assert.ok(css.includes('.post-viewer-header-desktop'), 'Has dedicated desktop header');
  assert.ok(css.includes('.close-post-inline'), 'Has mobile inline close button');

  // 5. Tablet responsive layout
  assert.ok(css.includes('768px') && css.includes('1023px'), 'Has tablet responsive styling between 768px and 1023px');
});
