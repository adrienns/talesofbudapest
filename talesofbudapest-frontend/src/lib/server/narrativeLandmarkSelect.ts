/** Columns loaded for narrative route planning and script grounding. */
export const NARRATIVE_LANDMARK_SELECT =
  'id, slug, name, latitude, longitude, story_prompt, source_material, image_url, source, landmark_type, place_kind, importance_tier, importance_score, history_depth, publication_status, tour_eligible, location_tour_facets(category_id,relevance_score,reviewed), location_media(url,author,source_url,license,license_url,sort_order,review_status,commercial_use_allowed)'
