import test from 'node:test';
import assert from 'node:assert/strict';
import { planRecommendations, retryForEmpty } from '../src/lib/planner';

const tags = [
  { id:'urn:tag:genre:artist:soul', name:'Soul', type:'urn:tag:genre:artist', affinity:0.9 },
  { id:'urn:tag:genre:place:cafe', name:'Cafe', type:'urn:tag:genre:place', affinity:0.8 },
  { id:'urn:tag:genre:brand:clothing', name:'Clothing', type:'urn:tag:genre:brand', affinity:0.7 },
];
test('chooses different tools for venue and grocery and uses observed compatible tags', () => {
  const venue = planRecommendations('venue', tags);
  const grocery = planRecommendations('grocery', tags);
  assert.deepEqual(venue.map(a=>a.type), ['artist','place','podcast','brand']);
  assert.deepEqual(grocery.map(a=>a.type), ['brand','place','artist','podcast','tv_show']);
  assert.deepEqual(venue[0].tags, [tags[0].id]);
  assert.equal(venue[1].tags, undefined);
  assert.deepEqual(grocery[0].tags, [tags[2].id]);
});
test('no tags falls back to location and never invents a signal', () => {
  assert.ok(planRecommendations('unknown', []).every(a => !a.tags));
});
test('retry only empty tag-steered results and never retry a service failure', () => {
  assert.equal(retryForEmpty(0,true,false),true);
  assert.equal(retryForEmpty(1,true,false),false);
  assert.equal(retryForEmpty(0,false,false),false);
  assert.equal(retryForEmpty(0,true,true),false);
});

test('uses a shared Qloo genre tag for artist discovery', () => {
  const plan = planRecommendations('venue', [{ id:'urn:tag:genre:qloo:southern_hip_hop', name:'Southern Hip Hop', type:'urn:tag:genre:qloo', affinity:0.9 }]);
  assert.deepEqual(plan[0].tags, ['urn:tag:genre:qloo:southern_hip_hop']);
});
