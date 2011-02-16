# Copyright 2010 Google Inc.
#
# Licensed under the Apache License, Version 2.0 (the 'License');
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an 'AS IS' BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

__author__ = 'elsigh@google.com (Lindsey Simon)'
__version__ = '0.1'


import datetime
import logging
import os
import sys
import time

import wsgiref.handlers

from google.appengine.api import urlfetch
from google.appengine.api import users

from google.appengine.ext import db
from google.appengine.ext import webapp
from google.appengine.ext.webapp import template
from google.appengine.ext.webapp.util import login_required

from django.utils import simplejson



#### DB MODELS ####
class Prototype(db.Model):
  user = db.UserProperty(required=True)
  content = db.TextProperty(required=True)
  created = db.DateTimeProperty(auto_now_add=True)
  modified = db.DateTimeProperty(auto_now=True)


class RequestHandler(webapp.RequestHandler):
  """Provides common functionality for use in other RequestHandlers."""

  def RenderTemplateOut(self, template_name, template_vars={}):
    """Writes out a rendered template with globally useful template_vars set.
    Args:
      template_name: The name of the template to render.
      template_vars: A dictionary of template variables.
    Returns:
      Writes the rendered template to response.out.
    """
    current_version_id = os.environ['CURRENT_VERSION_ID']
    server_software = os.getenv('SERVER_SOFTWARE')
    if server_software and 'Dev' in server_software:
      current_version_id = str(datetime.datetime.now())
    template_vars['current_version_id'] = current_version_id
    template_vars['login_url'] = users.create_login_url('/')
    template_vars['logout_url'] = users.create_logout_url('/')
    self.response.out.write(template.render('templates/%s' % template_name,
                                            template_vars))

#### HANDLERS ####

class EditorHandler(RequestHandler):
  @login_required
  def get(self):
    user = users.get_current_user()
    url = self.request.get('url')
    key = None

    if url:
      result = urlfetch.fetch(url)
      if result.status_code != 200:
        self.error(503)
        return self.response.out.write('Unable to urlfetch url: %s.' % url)
      content = result.content
    else:
      try:
        key = int(self.request.path[1:])
        prototype = db.get(db.Key.from_path('Prototype', int(key)))
        if prototype.user != user:
          # unsets the key so that any save action creates a new entity.
          key = ''
        content = prototype.content
      except ValueError:
        content = ''

    template_vars = {
      'key': key,
      'url': url,
      'content': content
    }
    self.RenderTemplateOut('editor.html', template_vars)


class SaveHandler(RequestHandler):
  def post(self):
    try:
      # 6 here is the len('/save/')
      key = int(self.request.path[6:])
    except:
      key = None

    user = users.get_current_user()
    content = self.request.get('content')

    logging.info('key: %s, content: %s' % (key, content))

    if user is None:
      self.error(503)
      return self.response.out.write('Cowardly refusal to be logged in.')
    if not content:
      self.error(503)
      return self.response.out.write('Cowardly refusal to save any content.')

    if key:
      prototype = db.get(db.Key.from_path('Prototype', key))
      if prototype.user != user:
        self.error(503)
        return self.response.out.write('You do not own this prototype.')
      prototype.content = content
    else:
      prototype = Prototype(content=content, user=user)
    prototype.put()

    self.redirect('/%s' % prototype.key().id())



class RenderHandler(RequestHandler):
  @login_required
  def get(self):
    try:
      # 8 here is the len('/render/')
      key = int(self.request.path[8:])
    except:
      self.error(404)
      return self.response.out.write('No prototype for your key')
    user = users.get_current_user()
    prototype = db.get(db.Key.from_path('Prototype', key))
    if not prototype:
      self.error(404)
      return self.response.out.write('No prototype exists with key: %s' % key)
    self.response.out.write(prototype.content)


def main():
  application = webapp.WSGIApplication(
                                       [(r'/save/.*', SaveHandler),
                                        (r'/render/.*', RenderHandler),
                                        (r'/.*', EditorHandler),],
                                       debug=True)
  wsgiref.handlers.CGIHandler().run(application)

if __name__ == "__main__":
  main()
