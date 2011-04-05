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
import re
import sys
import time

import wsgiref.handlers

from google.appengine.api import urlfetch
from google.appengine.api import users
from google.appengine.api.labs import taskqueue

from google.appengine.ext import db
from google.appengine.ext import webapp
from google.appengine.ext.webapp import template
from google.appengine.ext.webapp.util import login_required

from django.utils import simplejson

CLEANUP_TIMEOUT = 10800  # 3 hours in seconds.

#### DB MODELS ####
class Prototype(db.Model):
  user = db.UserProperty(required=True)
  fork_from = db.SelfReferenceProperty()
  title = db.StringProperty(default='Untitled')
  content = db.TextProperty()
  created = db.DateTimeProperty(auto_now_add=True)
  modified = db.DateTimeProperty(auto_now=True)


#### URL Handlers ####
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
    is_production = True
    server_software = os.getenv('SERVER_SOFTWARE')
    if server_software and 'Dev' in server_software:
      current_version_id = str(datetime.datetime.now())
      is_production = False

    template_vars['is_production'] = is_production
    template_vars['current_version_id'] = current_version_id
    template_vars['user'] = users.get_current_user()
    template_vars['login_url'] = users.create_login_url('/')
    template_vars['logout_url'] = users.create_logout_url('/')
    self.response.out.write(template.render('templates/%s' % template_name,
                                            template_vars))

  def IsXhr(self):
    return self.request.headers.get('X-Requested-With') == 'XMLHttpRequest'


def FetchPrototype(key):
  key = str(key)
  if len(key) > 30:
    return db.get(key)
  else:
    return db.get(db.Key.from_path('Prototype', int(key)))


def MoarRobustTaskQueue(url, params={}, countdown=0):
  """Attempts to prevent taskqueue.add from throwing TransientError.
  When BigTable is a suckin, this is the error that's thrown.
  It can be somewhat mitigated by trying taskqueue operations thrice.

  Args:
    url: The url of the taskqueue handler.
    queue_name: The name of the queue.
    params: A dict of data to pass to the handler.
    countdown: Number of seconds into the future that this Task should execute,
               measured from time of insertion.
  """
  attempt = 0
  while attempt < 3:
    logging.info(
          'Try with taskqueue.add (attempt %s): %s, %s, %s' %
          (attempt, url, params, countdown))
    try:
      taskqueue.add(url=url, params=params, countdown=countdown)
      break
    except taskqueue.TransientError:
      attempt += 1
      logging.info(
          'TransientError with taskqueue.add (attempt %s): %s, %s, %s' %
          (attempt, url, params, countdown))


#### HANDLERS ####

class EditorHandler(RequestHandler):
  @login_required
  def get(self):
    user = users.get_current_user()
    nickname = re.sub(r'@.*', '', user.email())
    domain = re.sub(r'^[^@]+@', '', user.email())

    # Removes any leading and trailing slashes.
    path_trimmed = re.sub('^\\/|\\/$', '', self.request.path)
    path_bits = path_trimmed.split('/')

    # Creates a new blank prototype.
    if path_trimmed == '' or len(path_bits) == 0:
      prototype = Prototype(user=user, content='')
      prototype.put()
      # Creates a task that would run in a few hours and delete
      # this entity if the user saves no content to it.
      key = prototype.key().id()
      params = {'key': key}
      MoarRobustTaskQueue(url='/_ah/queue/cleanup/%s' % key,
                          params=params,
                          countdown=CLEANUP_TIMEOUT)
      return self.redirect('/%s' % str(prototype.key().id()))

    key = path_bits[0]
    prototype = FetchPrototype(key)
    if not prototype:
      self.error(404)
      return self.response.out.write('There is no prototype for key: %s' %
                                     key)
    template_vars = {
      'user_nickname': nickname,
      'continue': self.request.path,
      'prototype': prototype,
      'is_owner': prototype.user == user
    }
    self.RenderTemplateOut('editor.html', template_vars)


class ForkHandler(RequestHandler):
  def post(self):
    try:
      # 6 here is the len('/fork/')
      key = self.request.path[6:]
    except e:
      self.error(404)
      return self.response.out.write('Cowardly refusal to send a key.')

    fork_from = FetchPrototype(key)
    if not fork_from:
      self.error(404)
      return self.response.out.write('There is no prototype for key: %s' %
                                     key)

    user = users.get_current_user()
    content = self.request.get('content')

    # Can't use the login_required decorator for POST.
    if user is None:
      self.error(503)
      return self.response.out.write('Cowardly refusal to be logged in.')

    title = 'Fork of %s' % fork_from.title
    prototype = Prototype(user=user, fork_from=fork_from, title=title,
                          content=content)
    prototype.put()

    self.redirect('/%s' % str(prototype.key().id()))


class SaveHandler(RequestHandler):
  def post(self):
    try:
      # 6 here is the len('/save/')
      key = self.request.path[6:]
    except e:
      self.error(503)
      return self.response.out.write('Cowardly refusal to send a key.')

    user = users.get_current_user()
    title = self.request.get('title')
    content = self.request.get('content')
    logging.info('key: %s, title: %s, content: %s' % (key, title, content))

    # Can't use the login_required decorator for POST.
    if user is None:
      self.error(503)
      return self.response.out.write('Cowardly refusal to be logged in.')

    prototype = FetchPrototype(key)
    if not prototype:
      self.error(404)
      return self.response.out.write('There is no prototype for key: %s' %
                                     key)
    if prototype.user != user:
      self.error(503)
      return self.response.out.write('You do not own this prototype.')
    prototype.content = content
    prototype.title = title
    prototype.put()

    if self.IsXhr():
      self.response.set_status(204)
      return self.response.out.write('')
    else:
      continue_path = self.request.get('continue',
          '/%s' % str(prototype.key().id()))
      self.redirect(continue_path)


class MineHandler(RequestHandler):
  """Renders a user's prototypes."""
  @login_required
  def get(self):
    user = self.request.get('user', users.get_current_user())
    prototypes = db.Query(Prototype)
    prototypes.filter('user =', user)
    prototypes.order('-created')
    template_vars = {
      'pagename': 'mine',
      'prototypes': prototypes
    }
    self.RenderTemplateOut('mine.html', template_vars)


class DeleteHandler(RequestHandler):
  def post(self):
    try:
      # 8 here is the len('/delete/')
      key = self.request.path[8:]
    except e:
      self.error(503)
      return self.response.out.write('Cowardly refusal to send a key.')

    prototype = FetchPrototype(key)
    if not prototype:
      self.error(404)
      return self.response.out.write('There is no prototype for key: %s' %
                                     key)
    user = users.get_current_user()
    if prototype.user != user and not user.is_current_user_admin():
      self.error(503)
      return self.response.out.write('You do not own this prototype.')

    prototype.delete()
    continue_path = self.request.get('continue', '/')
    self.redirect(continue_path)


class CleanupHandler(RequestHandler):
  def post(self):
    key = self.request.get('key')
    prototype = FetchPrototype(key)
    if not prototype:
      self.error(200)
      return self.response.out.write('There is no prototype for key: %s' %
                                     key)

    if prototype.title == 'Untitled' and prototype.content == '':
      prototype.delete()
      logging.info('Yay, deleted a wasteful prototype.')

    self.response.set_status(200)
    return self.response.out.write('')


class RenderHandler(RequestHandler):
  """Renders the raw html straight away, sans editor."""
  @login_required
  def get(self):
    try:
      # 8 here is the len('/render/')
      key = int(self.request.path[8:])
    except:
      self.error(404)
      return self.response.out.write('No prototype for your key')
    user = users.get_current_user()
    prototype = FetchPrototype(key)
    if not prototype:
      self.error(404)
      return self.response.out.write('No prototype exists with key: %s' % key)
    self.response.out.write(prototype.content)


class LogOutHandler(RequestHandler):
  def get(self):
    self.redirect(users.create_logout_url('/'))


class ProxyHandler(RequestHandler):
  """Gets the source of an url."""
  def get(self):
    result = urlfetch.fetch(self.request.get('url', 'http://www.google.com'))
    if result.status_code != 200:
      logging.error('Unable to urlfetch template_url: %s.' % template_url)
      return self.error(503)
    self.response.out.write(result.content)


def main():
  application = webapp.WSGIApplication(
    [(r'/_ah/queue/cleanup/.*', CleanupHandler),
     (r'/save/.*', SaveHandler),
     (r'/fork/.*', ForkHandler),
     (r'/render/.*', RenderHandler),
     (r'/mine', MineHandler),
     (r'/proxy', ProxyHandler),
     (r'/logout', LogOutHandler),
     (r'/delete/.*', DeleteHandler),
     (r'/.*', EditorHandler),],
     debug=True)
  wsgiref.handlers.CGIHandler().run(application)

if __name__ == "__main__":
  main()
