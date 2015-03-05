import Babel from "npm:babel";
import dedent from "npm:dedent";

var File = Em.Object.extend({
  compiled: Em.computed('content', function () {
    try {
      return Babel.transform(this.get('content')).code;
    } catch (e) {
      return e.message;
    }
  })
});

export default Em.Controller.extend({
  files: [
    File.create({name: 'routes/application.js', content:
      dedent `export default Em.Route.extend({
        model() {
          return ['a', 'b', 'c'];
        }
      })`
    })
  ]
});