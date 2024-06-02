from django.db import models
from users.models import CustomUser
from teams.models import Team

# Create your models here.

class Membership(models.Model):
    ROLE_CHOICES = [
        ('mentor', 'Mentor'),
        ('mentee', 'Mentee'),
    ]
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE)
    team = models.ForeignKey(Team, related_name='memberships', on_delete=models.CASCADE)
    role = models.CharField(max_length=6, choices=ROLE_CHOICES)
