/* eslint-disable no-console */
import Ember from 'ember';
import config from '../config/environment';
import { task, timeout } from 'ember-concurrency';
import compareVersions from 'compare-versions';

const { computed, deprecate, inject, RSVP, testing } = Ember;

const EMBER_VERSIONS = ['3.4.3', '3.3.2', '3.2.2', '3.1.4', '3.0.0', '2.18.2', '2.17.2', '2.16.2', '2.15.3', '2.14.1', '2.13.0', '2.12.0'];
const EMBER_DATA_VERSIONS = ['3.4.2', '3.3.2', '3.2.2', '3.1.2', '3.0.4', '2.18.5', '2.17.1', '2.16.4', '2.15.3', '2.14.10', '2.13.2', '2.12.2'];

const VERSION_REGEX = /^\d+.\d+.\d+(-beta\.\d+)?$/;

const CDN_MAP = {
  'ember': {
    pakage: 'ember-source',
    library: 'ember.js',
    fileName: 'ember.debug.js'
  },

  'ember-template-compiler': {
    pakage: 'ember-source',
    library: 'ember.js',
    fileName: 'ember-template-compiler.js'
  },

  'ember-testing': {
    pakage: 'ember-source',
    library: 'ember.js',
    fileName: 'ember-testing.js'
  },

  'ember-data': {
    pakage: 'ember-data',
    library: 'ember-data.js',
    fileName: 'ember-data.js'
  }
};

const POLL_INTERVAL = 10000;

export default Ember.Service.extend({
  notify: inject.service(),

  resolveDependencies(dependencies) {
    Object.keys(dependencies).forEach((name) => {
      let value = dependencies[name];

      dependencies[name] = this.resolveDependency(name, value);
    });
  },

  resolveAddons(addons, dependencies, emberVersion) {
    const taskInstance = this.get('resolveAddonsTask').perform(addons, dependencies, emberVersion);
    return taskInstance.then(() => taskInstance.value);
  },

  resolveAddonsTask: task(function *(addons, dependencies, emberVersion) {
    let done = false;
    while (!done) {
      let addonPromises = {};
      let addonNames = Object.keys(addons);
      for (let i = 0; i < addonNames.length; ++i) {
        const name = addonNames[i];
        const value = addons[name];
        addonPromises[name] = this.resolveAddon(name, value, emberVersion);
      }
      let allAddonsLoaded = true;
      try {
        let hash = yield RSVP.hash(addonPromises);
        for (let j = 0; j < addonNames.length; ++j) {
          const name = addonNames[j];
          const addon = hash[name];
          if (addon.status === 'build_success') {
            dependencies[name+'_js'] = addon.addon_js;
            dependencies[name+'_css'] = addon.addon_css;
            if (!testing) {
              console.log(`Addon ${name} is loaded...`);
            }
            delete addons[name];
          } else if (addon.status === 'building') {
            console.log(`Addon ${name} is still building...`);
            allAddonsLoaded = false;
          } else if (addon.status === 'build_error') {
            console.error(`Addon ${name} encountered a build error:`);
            if (addon.error_log) {
              console.error(addon.error_log);
            }
            allAddonsLoaded = false;
            throw addon;
          } else {
            console.error(addon);
          }
        }
      } catch(e) {
        try {
          this.get('notify').error(JSON.parse(e.responseText).errorMessage, {
            closeAfter: 10000
          });
        } catch(e2) {
          console.error(e);
        }
        throw e;
      }
      if (allAddonsLoaded) {
        done = true;
      } else {
        yield timeout(POLL_INTERVAL);
      }
    }
    return dependencies;
  }),

  resolveAddon(name, value, emberVersion) {
    const url = `${config.addonUrl}?ember_version=${emberVersion}&addon=${name}&addon_version=${value}`;
    return new RSVP.Promise(function(resolve) {
      Ember.$.getJSON(url).then(resolve);
    });
  },

  resolveDependency(name, value) {
    switch (name) {
      case 'ember':
      case 'ember-template-compiler':
      case 'ember-testing':
      case 'ember-data':
        return this.resolveEmberDependency(name, value);

      default:
        return value;
    }
  },

  resolveEmberDependency(name, value) {
    if (VERSION_REGEX.test(value)) {
      return this.cdnURL(name, value);
    }

    return value;
  },

  cdnURL(name, version) {
    let { pakage, library, fileName } = CDN_MAP[name];

    let deprecatedUrl = `//cdnjs.cloudflare.com/ajax/libs/${library}/${version}/${fileName}`;

    if (name === 'ember-data') {
      const msg = 'It is recommended you use ember-data as an addon';
      deprecate(msg, testing, {
        id: 'ember-twiddle.deprecate-ember-data-as-dependency',
        until: '0.16.0',
      });
      this.get('notify').warning(msg);

      return deprecatedUrl;
    }

    if (compareVersions(version, '2.12.0') === -1) {
      const msg = 'Versions of Ember prior to 2.12.0 are no longer supported in Ember Twiddle';
      deprecate(msg, testing, {
        id: 'ember-twiddle.deprecate-ember-versions-before-2-12',
        until: '0.16.0',
      });
      this.get('notify').warning(msg);

      return deprecatedUrl;
    }

    return `//cdn.jsdelivr.net/npm/${pakage}@${version}/dist/${fileName}`;
  },

  emberVersions: computed(function() {
    return EMBER_VERSIONS;
  }),

  emberDataVersions: computed(function() {
    return EMBER_DATA_VERSIONS;
  })
});
