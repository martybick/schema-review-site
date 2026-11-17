/**
 * @file Router.js
 * @copyright Xcential Corporation
 */

// ----------------------------------------------------------------------------
// Router
// ----------------------------------------------------------------------------

// NOTE: hash routes, so Firebase Hosting needs no server-side routing and
// every page has a link people can share. Patterns use ":name" segments.
export class Router {
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Private instance properties
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  #routes = [];
  #onChange = null;

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance internal methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  #matchRoute (
    pathText
  ) {
    const segments = pathText.split('/').filter((segment) => segment !== '');
    for (const route of this.#routes) {
      if (route.segments.length !== segments.length) {
        continue;
      }
      const params = {};
      const isMatch = route.segments.every((routeSegment, i) => {
        if (routeSegment.startsWith(':')) {
          params[routeSegment.slice(1)] = decodeURIComponent(segments[i]);
          return true;
        }
        return routeSegment === segments[i];
      });
      if (isMatch) {
        return { name: route.name, params };
      }
    }
    return { name: 'not-found', params: {} };
  }

  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
  // Instance properties & methods
  // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

  addRoute (
    name,
    pattern
  ) {
    this.#routes.push({ name, segments: pattern.split('/').filter((segment) => segment !== '') });
    return this;
  }

  getCurrentRoute () {
    const pathText = window.location.hash.replace(/^#/, '').split('?')[0];
    return this.#matchRoute(pathText);
  }

  start (
    onChange
  ) {
    this.#onChange = onChange;
    window.addEventListener('hashchange', () => this.#onChange(this.getCurrentRoute()));
  }
}
