from django.db import models
from users.models import CustomUser
from teams.models import Team


# Create your models here.
class Invitation(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('accepted', 'Accepted'),
        ('rejected', 'Rejected'),
    ]
    sender = models.ForeignKey(CustomUser, related_name='sent_invitations', on_delete=models.CASCADE)
    receiver = models.ForeignKey(CustomUser, related_name='received_invitations', on_delete=models.CASCADE)
    team = models.ForeignKey(Team, on_delete=models.CASCADE)
    status = models.CharField(max_length=8, choices=STATUS_CHOICES, default='pending')
    sent_date = models.DateTimeField(auto_now_add=True)